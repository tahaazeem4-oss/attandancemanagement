/**
 * syncAiQuotas.js
 *
 * Fetches the current OpenRouter account limits, counts active members in the
 * hierarchy, then upserts ai_quota_policies so the global pool reflects the
 * real token budget and every sub-scope inherits proportionally via percent mode.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-v1-... node backend/syncAiQuotas.js
 * Or set it in backend/.env alongside DATABASE_URL / DB_* vars.
 *
 * Safe to re-run at any time — uses INSERT … ON CONFLICT … DO UPDATE.
 */

require('dotenv').config({ path: __dirname + '/.env' });
const { Pool, types } = require('pg');

types.setTypeParser(20, (val) => parseInt(val, 10));

// ── 1) Config ────────────────────────────────────────────────────────────────

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.error('ERROR: OPENROUTER_API_KEY is not set.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'postgres',
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 3,
});

// ── 2) Fetch OpenRouter account stats ────────────────────────────────────────

async function fetchOpenRouterStats() {
  const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
    headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
  });
  if (!res.ok) throw new Error(`OpenRouter API returned ${res.status}`);
  const { data } = await res.json();
  return data;
}

// ── 3) Convert $ budget to request / token quotas ────────────────────────────
// Based on gpt-4o-mini pricing:  ~$0.00045 per query, ~450 tokens avg per query

const USD_PER_QUERY      = 0.00045;   // approx cost per AI tutor query
const TOKENS_PER_QUERY   = 2700;      // avg tokens (input 2000 + output 700)
const SAFETY_MARGIN      = 0.90;      // use 90% of budget (keep 10% buffer)

function budgetToQuotas(monthlyUsdBudget) {
  const usable        = monthlyUsdBudget * SAFETY_MARGIN;
  const monthRequests = Math.floor(usable / USD_PER_QUERY);
  const monthTokens   = monthRequests * TOKENS_PER_QUERY;

  return {
    monthly_requests : monthRequests,
    weekly_requests  : Math.floor(monthRequests / 4),
    daily_requests   : Math.floor(monthRequests / 30),
    monthly_tokens   : monthTokens,
    weekly_tokens    : Math.floor(monthTokens / 4),
    daily_tokens     : Math.floor(monthTokens / 30),
    max_input_tokens : 2000,
    max_output_tokens: 700,
  };
}

// ── 4) Count active hierarchy members (AI-enabled only) ──────────────────────

async function countMembers(db) {
  // Load all feature flags
  const { rows: flags } = await db.query(
    `SELECT scope_type, scope_id, is_enabled FROM ai_feature_flags`
  );
  const flagMap = new Map();
  for (const f of flags) flagMap.set(`${f.scope_type}#${f.scope_id}`, f.is_enabled);

  // Global default is ON unless explicitly set off
  const globalOn = flagMap.has('global#null') ? flagMap.get('global#null') : true;

  // All orgs, campuses, students
  const { rows: orgRows }     = await db.query('SELECT id FROM organizations');
  const { rows: campusRows }  = await db.query('SELECT id, org_id FROM schools');
  const { rows: studentRows } = await db.query('SELECT id, school_id FROM students');
  const { rows: classRows }   = await db.query('SELECT COUNT(*) AS n FROM classes');
  const { rows: sectionRows } = await db.query('SELECT COUNT(*) AS n FROM sections');

  // Resolve which orgs are enabled
  const activeOrgIds = new Set();
  for (const org of orgRows) {
    const k = `organization#${org.id}`;
    const on = flagMap.has(k) ? flagMap.get(k) : globalOn;
    if (on) activeOrgIds.add(org.id);
  }

  // Resolve which campuses are enabled (campus must be in active org AND campus flag on)
  const activeCampusIds = new Set();
  for (const campus of campusRows) {
    if (!activeOrgIds.has(campus.org_id)) continue;
    const k = `campus#${campus.id}`;
    const on = flagMap.has(k) ? flagMap.get(k) : true;
    if (on) activeCampusIds.add(campus.id);
  }

  // Count students in active campuses
  const activeStudents = studentRows.filter(s => activeCampusIds.has(s.school_id));

  return {
    orgs          : activeOrgIds.size,
    allOrgIds     : orgRows.map(r => r.id),
    activeOrgIds,
    campuses      : activeCampusIds.size,
    allCampusRows : campusRows,
    activeCampusIds,
    classes       : parseInt(classRows[0].n),
    sections      : parseInt(sectionRows[0].n),
    students      : activeStudents.length,
    totalStudents : studentRows.length,
  };
}

// ── 5) Calculate percent allocations ─────────────────────────────────────────
// percent_bps = basis points (10000 = 100%)
// Each child scope gets an equal share of the parent pool.

function equalShareBps(count) {
  if (!count || count <= 0) return 10000; // 100% if only one
  return Math.floor(10000 / count);
}

// ── 6) Upsert a quota policy row ─────────────────────────────────────────────

async function upsertPolicy(db, scopeType, scopeId, fields) {
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  const setClauses = cols.map((c, i) => `${c} = $${i + 3}`).join(', ');

  // Check if row exists first (handles NULL scope_id correctly)
  const existing = await db.query(
    scopeId === null
      ? `SELECT id FROM ai_quota_policies WHERE scope_type = $1 AND scope_id IS NULL`
      : `SELECT id FROM ai_quota_policies WHERE scope_type = $1 AND scope_id = $2`,
    scopeId === null ? [scopeType] : [scopeType, scopeId],
  );

  if (existing.rows.length > 0) {
    const updateCols = [...cols, 'updated_by_role', 'updated_by_id', 'updated_at'];
    const updateVals = [...vals, 'super_admin', 0, new Date().toISOString()];
    const updateSet  = updateCols.map((c, i) => `${c} = $${i + 2}`).join(', ');
    const whereClause = scopeId === null
      ? `scope_type = $1 AND scope_id IS NULL`
      : `scope_type = $1 AND scope_id = ${scopeId}`;
    await db.query(
      `UPDATE ai_quota_policies SET ${updateSet} WHERE ${whereClause}`,
      [scopeType, ...updateVals],
    );
  } else {
    await db.query(
      `INSERT INTO ai_quota_policies
        (scope_type, scope_id, ${cols.join(', ')}, updated_by_role, updated_by_id, updated_at)
       VALUES
        ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(', ')}, 'super_admin', 0, NOW())`,
      [scopeType, scopeId, ...vals],
    );
  }
}

// ── 7) Main ───────────────────────────────────────────────────────────────────

async function main() {
  const db = await pool.connect();
  try {
    console.log('Fetching OpenRouter account stats...');
    const stats = await fetchOpenRouterStats();

    const monthlyBudget = stats.limit ?? 10;
    const usedMonthly   = stats.usage_monthly ?? 0;
    const remaining     = stats.limit_remaining ?? monthlyBudget;

    console.log(`\nOpenRouter account:`);
    console.log(`  Monthly budget  : $${monthlyBudget}`);
    console.log(`  Used this month : $${usedMonthly.toFixed(4)}`);
    console.log(`  Remaining       : $${remaining.toFixed(4)}`);

    const globalQuotas = budgetToQuotas(monthlyBudget);
    console.log(`\nGlobal quotas derived from $${monthlyBudget} budget:`);
    console.log(`  monthly_requests  : ${globalQuotas.monthly_requests}`);
    console.log(`  weekly_requests   : ${globalQuotas.weekly_requests}`);
    console.log(`  daily_requests    : ${globalQuotas.daily_requests}`);
    console.log(`  monthly_tokens    : ${globalQuotas.monthly_tokens}`);
    console.log(`  weekly_tokens     : ${globalQuotas.weekly_tokens}`);
    console.log(`  daily_tokens      : ${globalQuotas.daily_tokens}`);
    console.log(`  max_input_tokens  : ${globalQuotas.max_input_tokens}`);
    console.log(`  max_output_tokens : ${globalQuotas.max_output_tokens}`);

    // Set GLOBAL (fixed values)
    await upsertPolicy(db, 'global', null, {
      ...globalQuotas,
      ...Object.fromEntries(
        ['daily_requests','weekly_requests','monthly_requests',
         'daily_tokens','weekly_tokens','monthly_tokens'].map(f => [`${f}_mode`, 'fixed'])
      ),
    });
    console.log('\n✓ Global policy set (fixed mode)');

    // Count active members
    const counts = await countMembers(db);
    console.log(`\nHierarchy members (AI-enabled / total):`);
    console.log(`  Organizations : ${counts.orgs} active / ${counts.allOrgIds.length} total`);
    console.log(`  Campuses      : ${counts.campuses} active / ${counts.allCampusRows.length} total`);
    console.log(`  Classes       : ${counts.classes}`);
    console.log(`  Sections      : ${counts.sections}`);
    console.log(`  Students      : ${counts.students} active / ${counts.totalStudents} total`);

    const distributableFields = [
      'daily_requests','weekly_requests','monthly_requests',
      'daily_tokens','weekly_tokens','monthly_tokens',
    ];

    // Per-org: active orgs get equal share of global, inactive get 0
    const orgBps = equalShareBps(counts.orgs);
    for (const orgId of counts.allOrgIds) {
      const isActive = counts.activeOrgIds.has(orgId);
      const fields = isActive
        ? Object.fromEntries([
            ...distributableFields.map(f => [`${f}_mode`, 'percent']),
            ...distributableFields.map(f => [`${f}_percent_bps`, orgBps]),
            ['max_input_tokens', globalQuotas.max_input_tokens],
            ['max_output_tokens', globalQuotas.max_output_tokens],
          ])
        : Object.fromEntries([
            ...distributableFields.map(f => [`${f}_mode`, 'fixed']),
            ...distributableFields.map(f => [f, 0]),
            ['max_input_tokens', 0],
            ['max_output_tokens', 0],
          ]);
      await upsertPolicy(db, 'organization', orgId, fields);
    }
    console.log(`✓ Organization policies set (${counts.orgs} active get ${orgBps} bps each, rest set to 0)`);

    // Per-campus: active campuses get equal share of their org's pool, inactive get 0
    // Group active campuses per org to compute per-org share
    const activeCampusesPerOrg = new Map();
    for (const campus of counts.allCampusRows) {
      if (!counts.activeCampusIds.has(campus.id)) continue;
      if (!activeCampusesPerOrg.has(campus.org_id)) activeCampusesPerOrg.set(campus.org_id, 0);
      activeCampusesPerOrg.set(campus.org_id, activeCampusesPerOrg.get(campus.org_id) + 1);
    }

    for (const campus of counts.allCampusRows) {
      const isActive = counts.activeCampusIds.has(campus.id);
      const activeSiblings = activeCampusesPerOrg.get(campus.org_id) || 1;
      const campusBps = equalShareBps(activeSiblings);
      const fields = isActive
        ? Object.fromEntries([
            ...distributableFields.map(f => [`${f}_mode`, 'percent']),
            ...distributableFields.map(f => [`${f}_percent_bps`, campusBps]),
            ['max_input_tokens', globalQuotas.max_input_tokens],
            ['max_output_tokens', globalQuotas.max_output_tokens],
          ])
        : Object.fromEntries([
            ...distributableFields.map(f => [`${f}_mode`, 'fixed']),
            ...distributableFields.map(f => [f, 0]),
            ['max_input_tokens', 0],
            ['max_output_tokens', 0],
          ]);
      await upsertPolicy(db, 'campus', campus.id, fields);
    }
    console.log(`✓ Campus policies set (active campuses get equal share of their org pool)`);

    const effectiveMonthlyPerStudent = counts.students > 0
      ? Math.floor(globalQuotas.monthly_requests / counts.students)
      : 0;

    console.log(`\n✓ Sync complete. Classes, sections, students inherit from campus via cascade.`);
    console.log(`\nSummary:`);
    console.log(`  Budget $${monthlyBudget}/month → ${globalQuotas.monthly_requests} requests/month global`);
    console.log(`  Active orgs: ${counts.orgs} → each gets ${orgBps} bps (${(orgBps/100).toFixed(0)}%) of global`);
    console.log(`  Active students: ${counts.students} → ~${effectiveMonthlyPerStudent} requests/student/month`);

  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});

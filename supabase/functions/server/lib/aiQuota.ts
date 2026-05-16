// supabase/functions/server/lib/aiQuota.ts
// Resolves effective quotas (most restrictive across scopes) and updates counters atomically.
import { getDb } from "../_shared.ts";
import type { AiScope } from "./aiScope.ts";

export interface QuotaLimits {
  daily_requests: number | null;
  weekly_requests: number | null;
  monthly_requests: number | null;
  daily_tokens: number | null;
  weekly_tokens: number | null;
  monthly_tokens: number | null;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
}

export interface QuotaState extends QuotaLimits {
  used_today_requests: number;
  used_week_requests: number;
  used_month_requests: number;
  used_today_tokens: number;
  used_week_tokens: number;
  used_month_tokens: number;
  remaining_daily_requests: number | null;
  remaining_weekly_requests: number | null;
  remaining_monthly_requests: number | null;
}

const DISTRIBUTABLE: (keyof QuotaLimits)[] = [
  "daily_requests","weekly_requests","monthly_requests",
  "daily_tokens","weekly_tokens","monthly_tokens",
];
const PER_REQUEST_CAPS: (keyof QuotaLimits)[] = ["max_input_tokens","max_output_tokens"];

function minDefined(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && v >= 0);
  return nums.length ? Math.min(...nums) : null;
}

// Build the descending chain of entities for the scope. Includes only levels
// the student actually belongs to. Each entry is { type, id|null }.
function buildScopeChain(scope: AiScope): Array<{ type: string; id: number | null }> {
  const c: Array<{ type: string; id: number | null }> = [{ type: "global", id: null }];
  if (scope.organization_id) c.push({ type: "organization", id: scope.organization_id });
  if (scope.campus_id)        c.push({ type: "campus",       id: scope.campus_id });
  if (scope.class_id)         c.push({ type: "class",        id: scope.class_id });
  if (scope.section_id)       c.push({ type: "section",      id: scope.section_id });
  if (scope.student_id)       c.push({ type: "student",      id: scope.student_id });
  return c;
}

export async function getEffectiveQuota(scope: AiScope): Promise<QuotaLimits> {
  const db = getDb();
  const chain = buildScopeChain(scope);

  // Fetch all policies along the chain in one go.
  const chainOr = chain
    .map((c) =>
      c.id === null
        ? `and(scope_type.eq.global,scope_id.is.null)`
        : `and(scope_type.eq.${c.type},scope_id.eq.${c.id})`,
    )
    .join(",");
  const { data: chainRows } = await db
    .from("ai_quota_policies")
    .select("scope_type, scope_id, daily_requests, weekly_requests, monthly_requests, daily_tokens, weekly_tokens, monthly_tokens, max_input_tokens, max_output_tokens")
    .or(chainOr);

  const chainPolicyBy = new Map<string, Partial<QuotaLimits>>();
  for (const r of (chainRows || []) as Array<Partial<QuotaLimits> & { scope_type: string; scope_id: number | null }>) {
    const k = r.scope_id === null ? `${r.scope_type}#null` : `${r.scope_type}#${r.scope_id}`;
    chainPolicyBy.set(k, r);
  }
  const keyOf = (t: string, id: number | null) => (id === null ? `${t}#null` : `${t}#${id}`);
  const ownOf = (t: string, id: number | null) => chainPolicyBy.get(keyOf(t, id)) || {};

  // Per-request caps: strictest along chain (min).
  const merged: QuotaLimits = {
    daily_requests: null, weekly_requests: null, monthly_requests: null,
    daily_tokens: null, weekly_tokens: null, monthly_tokens: null,
    max_input_tokens: null, max_output_tokens: null,
  };
  for (const f of PER_REQUEST_CAPS) {
    const vals = chain.map((c) => (ownOf(c.type, c.id)[f] as number | null | undefined));
    (merged as Record<string, number | null>)[f] = minDefined(vals);
  }

  // Distributable fields: pool walk top-down, dividing parent's pool among
  // siblings by student count after subtracting manually-allocated shares.
  // To do this we need sibling lists + per-sibling manual values + student counts.

  // Identify the sibling set at each level along the chain (levels 1..len-1).
  type SibKey = { level: number; parentType: string; parentId: number | null; childType: string };
  const sibKeysByLevel: SibKey[] = [];
  for (let i = 1; i < chain.length; i++) {
    sibKeysByLevel.push({
      level: i,
      parentType: chain[i - 1].type,
      parentId: chain[i - 1].id,
      childType: chain[i].type,
    });
  }

  // Fetch sibling entity sets and their manual policies for distributable fields.
  // siblings: map level -> Array<{ id, students }>
  const siblingsByLevel = new Map<number, Array<{ id: number; students: number }>>();
  for (const sk of sibKeysByLevel) {
    let entityRows: Array<{ id: number }> = [];
    if (sk.childType === "organization") {
      const { data } = await db.from("organizations").select("id");
      entityRows = (data || []) as Array<{ id: number }>;
    } else if (sk.childType === "campus") {
      const { data } = await db.from("schools").select("id").eq("org_id", sk.parentId);
      entityRows = (data || []) as Array<{ id: number }>;
    } else if (sk.childType === "class") {
      const { data } = await db.from("classes").select("id").eq("school_id", sk.parentId);
      entityRows = (data || []) as Array<{ id: number }>;
    } else if (sk.childType === "section") {
      const { data } = await db.from("sections").select("id").eq("class_id", sk.parentId);
      entityRows = (data || []) as Array<{ id: number }>;
    } else if (sk.childType === "student") {
      const { data } = await db.from("students").select("id").eq("section_id", sk.parentId);
      entityRows = (data || []) as Array<{ id: number }>;
    }
    // Student counts for each sibling.
    const enriched: Array<{ id: number; students: number }> = [];
    for (const r of entityRows) {
      let n = 1;
      if (sk.childType !== "student") {
        n = await countStudentsForEntity(sk.childType, r.id);
      }
      enriched.push({ id: r.id, students: n });
    }
    siblingsByLevel.set(sk.level, enriched);
  }

  // Fetch all sibling manual policies in batch per level.
  const sibPoliciesByLevel = new Map<number, Map<number, Partial<QuotaLimits>>>();
  for (const sk of sibKeysByLevel) {
    const sibs = siblingsByLevel.get(sk.level) || [];
    if (!sibs.length) { sibPoliciesByLevel.set(sk.level, new Map()); continue; }
    const ids = sibs.map((s) => s.id);
    const { data } = await db
      .from("ai_quota_policies")
      .select("scope_id, daily_requests, weekly_requests, monthly_requests, daily_tokens, weekly_tokens, monthly_tokens")
      .eq("scope_type", sk.childType)
      .in("scope_id", ids);
    const map = new Map<number, Partial<QuotaLimits>>();
    for (const r of (data || []) as Array<Partial<QuotaLimits> & { scope_id: number }>) {
      map.set(Number(r.scope_id), r);
    }
    sibPoliciesByLevel.set(sk.level, map);
  }

  // Walk each distributable field independently.
  for (const F of DISTRIBUTABLE) {
    // Start at global.
    let pool: number | null = (ownOf("global", null)[F] as number | null | undefined) ?? null;

    for (let i = 1; i < chain.length; i++) {
      const here = chain[i];
      const ownVal = (ownOf(here.type, here.id)[F] as number | null | undefined);
      if (ownVal !== null && ownVal !== undefined) {
        pool = Number(ownVal);
        continue;
      }
      // Auto: derive from parent pool.
      if (pool === null) continue; // unlimited stays unlimited.
      const sibs = siblingsByLevel.get(i) || [];
      const sibPol = sibPoliciesByLevel.get(i) || new Map();
      let manualSum = 0;
      let nonManualStudents = 0;
      let myStudents = 1;
      for (const s of sibs) {
        const own = sibPol.get(s.id)?.[F] as number | null | undefined;
        if (own !== null && own !== undefined) {
          manualSum += Number(own);
        } else {
          nonManualStudents += s.students;
        }
        if (s.id === here.id) myStudents = s.students;
      }
      const remaining = Math.max(0, pool - manualSum);
      pool = nonManualStudents > 0
        ? Math.floor(remaining * myStudents / nonManualStudents)
        : 0;
    }
    (merged as Record<string, number | null>)[F] = pool;
  }

  return merged;
}

// Count of students under any entity.
async function countStudentsForEntity(type: string, id: number): Promise<number> {
  const db = getDb();
  if (type === "section") {
    const { count } = await db.from("students").select("id", { count: "exact", head: true }).eq("section_id", id);
    return count ?? 0;
  }
  if (type === "class") {
    const { count } = await db.from("students").select("id", { count: "exact", head: true }).eq("class_id", id);
    return count ?? 0;
  }
  if (type === "campus") {
    const { count } = await db.from("students").select("id", { count: "exact", head: true }).eq("school_id", id);
    return count ?? 0;
  }
  if (type === "organization") {
    const { data } = await db.from("schools").select("id").eq("org_id", id);
    const schoolIds = ((data || []) as Array<{ id: number }>).map((r) => r.id);
    if (!schoolIds.length) return 0;
    const { count } = await db.from("students").select("id", { count: "exact", head: true }).in("school_id", schoolIds);
    return count ?? 0;
  }
  return 0;
}

function periodStart(type: "daily" | "weekly" | "monthly"): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  if (type === "daily") return d.toISOString().slice(0, 10);
  if (type === "weekly") {
    const day = d.getUTCDay();
    const diff = (day === 0 ? 6 : day - 1); // Monday-start week
    d.setUTCDate(d.getUTCDate() - diff);
    return d.toISOString().slice(0, 10);
  }
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

export async function loadQuotaState(scope: AiScope, limits: QuotaLimits): Promise<QuotaState> {
  const db = getDb();
  const periods = (["daily","weekly","monthly"] as const).map((p) => ({ p, start: periodStart(p) }));
  const { data } = await db
    .from("ai_quota_counters")
    .select("period_type, period_start, used_requests, used_tokens")
    .eq("student_id", scope.student_id!)
    .in("period_type", periods.map((x) => x.p))
    .in("period_start", periods.map((x) => x.start));

  const byKey = new Map<string, { used_requests: number; used_tokens: number }>();
  for (const r of (data || []) as Array<{ period_type: string; period_start: string; used_requests: number; used_tokens: number }>) {
    byKey.set(`${r.period_type}:${r.period_start}`, { used_requests: r.used_requests, used_tokens: r.used_tokens });
  }
  const get = (p: "daily" | "weekly" | "monthly") => byKey.get(`${p}:${periodStart(p)}`) || { used_requests: 0, used_tokens: 0 };
  const d = get("daily"), w = get("weekly"), m = get("monthly");

  const rem = (lim: number | null, used: number) => (lim === null ? null : Math.max(0, lim - used));

  return {
    ...limits,
    used_today_requests: d.used_requests,
    used_week_requests:  w.used_requests,
    used_month_requests: m.used_requests,
    used_today_tokens:   d.used_tokens,
    used_week_tokens:    w.used_tokens,
    used_month_tokens:   m.used_tokens,
    remaining_daily_requests:   rem(limits.daily_requests,   d.used_requests),
    remaining_weekly_requests:  rem(limits.weekly_requests,  w.used_requests),
    remaining_monthly_requests: rem(limits.monthly_requests, m.used_requests),
  };
}

/** Pre-check before calling OpenAI. */
export function assertCanQuery(state: QuotaState): { ok: boolean; reason?: string } {
  const checks: Array<[number | null, number, string]> = [
    [state.daily_requests,   state.used_today_requests, "Daily request quota reached"],
    [state.weekly_requests,  state.used_week_requests,  "Weekly request quota reached"],
    [state.monthly_requests, state.used_month_requests, "Monthly request quota reached"],
    [state.daily_tokens,     state.used_today_tokens,   "Daily token quota reached"],
    [state.weekly_tokens,    state.used_week_tokens,    "Weekly token quota reached"],
    [state.monthly_tokens,   state.used_month_tokens,   "Monthly token quota reached"],
  ];
  for (const [lim, used, msg] of checks) {
    if (lim !== null && used >= lim) return { ok: false, reason: msg };
  }
  return { ok: true };
}

/** Increment current-period counters by 1 request and the tokens used. */
export async function incrementUsage(studentId: number, totalTokens: number): Promise<void> {
  const db = getDb();
  for (const p of ["daily","weekly","monthly"] as const) {
    const start = periodStart(p);
    const { data: existing } = await db
      .from("ai_quota_counters")
      .select("id, used_requests, used_tokens")
      .eq("student_id", studentId)
      .eq("period_type", p)
      .eq("period_start", start)
      .maybeSingle();
    if (existing) {
      await db.from("ai_quota_counters")
        .update({
          used_requests: (existing.used_requests || 0) + 1,
          used_tokens:   (existing.used_tokens   || 0) + totalTokens,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await db.from("ai_quota_counters").insert({
        student_id: studentId,
        period_type: p,
        period_start: start,
        used_requests: 1,
        used_tokens: totalTokens,
      });
    }
  }
}

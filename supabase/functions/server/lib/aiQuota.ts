// supabase/functions/server/lib/aiQuota.ts
// Resolves effective quotas and updates usage counters.
//
// Students: daily/monthly requests+tokens are a shared pool (see
// aiQuotaTree.ts) that divides from the global default down through
// organization → campus → class → section → student, pro-rata by active
// (AI-enabled) student count, with manual overrides taken off the top.
// max_input_tokens/max_output_tokens are per-request caps, not a budget, so
// they stay "closest explicit scope wins."
// Teachers: closest explicit ai_quota_policies row wins outright — teacher
// usage is already pooled by construction (one shared counter per resolved
// scope in ai_teacher_quota_counters, incremented by every teacher there).
import { getDb } from "../_shared.ts";
import { buildScopeChain, type AiScope } from "./aiScope.ts";
import { loadQuotaTree, POOLED_FIELDS, CAP_FIELDS, type PooledField, type CapField } from "./aiQuotaTree.ts";

export interface QuotaLimits {
  daily_requests: number | null;
  monthly_requests: number | null;
  daily_tokens: number | null;
  monthly_tokens: number | null;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
}

export interface QuotaState extends QuotaLimits {
  used_today_requests: number;
  used_month_requests: number;
  used_today_tokens: number;
  used_month_tokens: number;
  remaining_daily_requests: number | null;
  remaining_monthly_requests: number | null;
}

export const QUOTA_FIELDS: (keyof QuotaLimits)[] = [
  "daily_requests", "monthly_requests", "daily_tokens", "monthly_tokens",
  "max_input_tokens", "max_output_tokens",
];

function numericOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function emptyLimits(): QuotaLimits {
  return {
    daily_requests: null, monthly_requests: null,
    daily_tokens: null, monthly_tokens: null,
    max_input_tokens: null, max_output_tokens: null,
  };
}

/** The most specific (type, id) pair present on a scope — the node whose
 * quota we're resolving. */
function mostSpecificNode(scope: AiScope): { type: "global" | "organization" | "campus" | "class" | "section" | "student"; id: number | null } {
  const chain = buildScopeChain(scope); // most-specific first
  return chain[0] as { type: "global" | "organization" | "campus" | "class" | "section" | "student"; id: number | null };
}

/** Resolve the effective quota for a scope. */
export async function getEffectiveQuota(
  scope: AiScope,
  actorType: "student" | "teacher" = "student",
): Promise<QuotaLimits> {
  if (actorType === "teacher") {
    const resolved = await resolveQuotaRow(scope, "teacher");
    return resolved.limits;
  }

  const { type, id } = mostSpecificNode(scope);
  const tree = await loadQuotaTree();
  const limits = emptyLimits();
  for (const F of POOLED_FIELDS as readonly PooledField[]) limits[F] = tree.effectivePooled(type, id, F).value;
  for (const F of CAP_FIELDS as readonly CapField[]) limits[F] = tree.effectiveCap(type, id, F).value;
  return limits;
}

/** Closest-explicit-row resolver — teacher-only now (students are pooled,
 * see getEffectiveQuota above). Also reports which scope the row came from,
 * needed for teacher usage, which is pooled per resolved scope, not per teacher. */
export async function resolveQuotaRow(
  scope: AiScope,
  actorType: "teacher" = "teacher",
): Promise<{ limits: QuotaLimits; scope_type: string; scope_id: number | null }> {
  const db = getDb();
  const chain = buildScopeChain(scope).filter((c) => c.type === "global" || c.type === "organization" || c.type === "campus");

  const orFilter = chain
    .map((c) => (c.id === null
      ? `and(scope_type.eq.global,scope_id.is.null)`
      : `and(scope_type.eq.${c.type},scope_id.eq.${c.id})`))
    .join(",");

  const { data } = await db
    .from("ai_quota_policies")
    .select("*")
    .eq("actor_type", actorType)
    .or(orFilter);

  const rowByKey = new Map<string, Record<string, unknown>>();
  for (const r of (data || []) as Array<Record<string, unknown>>) {
    rowByKey.set(`${r.scope_type}:${r.scope_id ?? "null"}`, r);
  }

  for (const pair of chain) {
    const row = rowByKey.get(`${pair.type}:${pair.id ?? "null"}`);
    if (row) {
      const limits = emptyLimits();
      for (const F of QUOTA_FIELDS) limits[F] = numericOrNull(row[F]);
      return { limits, scope_type: pair.type, scope_id: pair.id };
    }
  }

  // No policy anywhere in the chain — unlimited by default.
  return { limits: emptyLimits(), scope_type: "global", scope_id: null };
}

function periodStart(type: "daily" | "monthly"): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  if (type === "daily") return d.toISOString().slice(0, 10);
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

async function currentPolicyEpoch(): Promise<number> {
  const db = getDb();
  const { data } = await db.from("ai_quota_runtime_state").select("policy_epoch").eq("singleton_id", true).maybeSingle();
  return Number(data?.policy_epoch || 1);
}

// ── Student usage (per-student counters, unchanged shape minus weekly) ──

export async function loadQuotaState(scope: AiScope, limits: QuotaLimits): Promise<QuotaState> {
  const db = getDb();
  const policyEpoch = await currentPolicyEpoch();
  const periods = (["daily", "monthly"] as const).map((p) => ({ p, start: periodStart(p) }));
  const { data } = await db
    .from("ai_quota_counters")
    .select("period_type, period_start, used_requests, used_tokens")
    .eq("student_id", scope.student_id!)
    .eq("policy_epoch", policyEpoch)
    .in("period_type", periods.map((x) => x.p))
    .in("period_start", periods.map((x) => x.start));

  const byKey = new Map<string, { used_requests: number; used_tokens: number }>();
  for (const r of (data || []) as Array<{ period_type: string; period_start: string; used_requests: number; used_tokens: number }>) {
    byKey.set(`${r.period_type}:${r.period_start}`, { used_requests: r.used_requests, used_tokens: r.used_tokens });
  }
  const get = (p: "daily" | "monthly") => byKey.get(`${p}:${periodStart(p)}`) || { used_requests: 0, used_tokens: 0 };
  const d = get("daily"), m = get("monthly");
  const rem = (lim: number | null, used: number) => (lim === null ? null : Math.max(0, lim - used));

  return {
    ...limits,
    used_today_requests: d.used_requests,
    used_month_requests: m.used_requests,
    used_today_tokens: d.used_tokens,
    used_month_tokens: m.used_tokens,
    remaining_daily_requests: rem(limits.daily_requests, d.used_requests),
    remaining_monthly_requests: rem(limits.monthly_requests, m.used_requests),
  };
}

export function assertCanQuery(state: QuotaState): { ok: boolean; reason?: string } {
  const checks: Array<[number | null, number, string]> = [
    [state.daily_requests, state.used_today_requests, "Daily request quota reached"],
    [state.monthly_requests, state.used_month_requests, "Monthly request quota reached"],
    [state.daily_tokens, state.used_today_tokens, "Daily token quota reached"],
    [state.monthly_tokens, state.used_month_tokens, "Monthly token quota reached"],
  ];
  for (const [lim, used, msg] of checks) {
    if (lim !== null && used >= lim) return { ok: false, reason: msg };
  }
  return { ok: true };
}

export async function incrementUsage(studentId: number, totalTokens: number): Promise<void> {
  const db = getDb();
  const policyEpoch = await currentPolicyEpoch();
  for (const p of ["daily", "monthly"] as const) {
    const start = periodStart(p);
    const { data: existing } = await db
      .from("ai_quota_counters")
      .select("id, used_requests, used_tokens")
      .eq("student_id", studentId)
      .eq("policy_epoch", policyEpoch)
      .eq("period_type", p)
      .eq("period_start", start)
      .maybeSingle();
    if (existing) {
      await db.from("ai_quota_counters")
        .update({
          used_requests: (existing.used_requests || 0) + 1,
          used_tokens: (existing.used_tokens || 0) + totalTokens,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await db.from("ai_quota_counters").insert({
        student_id: studentId,
        policy_epoch: policyEpoch,
        period_type: p,
        period_start: start,
        used_requests: 1,
        used_tokens: totalTokens,
      });
    }
  }
}

// ── Teacher usage (pooled per resolved scope — one shared counter for
// every teacher governed by the same policy row, not per-teacher). ──────

export interface TeacherQuotaState extends QuotaLimits {
  scope_type: string;
  scope_id: number | null;
  used_today_requests: number;
  used_month_requests: number;
  used_today_tokens: number;
  used_month_tokens: number;
}

export async function loadTeacherQuotaState(scope: AiScope): Promise<TeacherQuotaState> {
  const db = getDb();
  const { limits, scope_type, scope_id } = await resolveQuotaRow(scope, "teacher");
  const policyEpoch = await currentPolicyEpoch();
  const periods = (["daily", "monthly"] as const).map((p) => ({ p, start: periodStart(p) }));
  let counterQ = db
    .from("ai_teacher_quota_counters")
    .select("period_type, period_start, used_requests, used_tokens")
    .eq("scope_type", scope_type)
    .eq("policy_epoch", policyEpoch)
    .in("period_type", periods.map((x) => x.p))
    .in("period_start", periods.map((x) => x.start));
  counterQ = scope_id === null ? counterQ.is("scope_id", null) : counterQ.eq("scope_id", scope_id);
  const { data } = await counterQ;

  const byKey = new Map<string, { used_requests: number; used_tokens: number }>();
  for (const r of (data || []) as Array<{ period_type: string; period_start: string; used_requests: number; used_tokens: number }>) {
    byKey.set(`${r.period_type}:${r.period_start}`, { used_requests: r.used_requests, used_tokens: r.used_tokens });
  }
  const get = (p: "daily" | "monthly") => byKey.get(`${p}:${periodStart(p)}`) || { used_requests: 0, used_tokens: 0 };
  const d = get("daily"), m = get("monthly");

  return {
    ...limits,
    scope_type, scope_id,
    used_today_requests: d.used_requests,
    used_month_requests: m.used_requests,
    used_today_tokens: d.used_tokens,
    used_month_tokens: m.used_tokens,
  };
}

export function assertCanQueryTeacher(state: TeacherQuotaState): { ok: boolean; reason?: string } {
  const checks: Array<[number | null, number, string]> = [
    [state.daily_requests, state.used_today_requests, "Daily AI usage limit reached for this school"],
    [state.monthly_requests, state.used_month_requests, "Monthly AI usage limit reached for this school"],
    [state.daily_tokens, state.used_today_tokens, "Daily AI usage limit reached for this school"],
    [state.monthly_tokens, state.used_month_tokens, "Monthly AI usage limit reached for this school"],
  ];
  for (const [lim, used, msg] of checks) {
    if (lim !== null && used >= lim) return { ok: false, reason: msg };
  }
  return { ok: true };
}

export async function incrementTeacherUsage(
  scopeType: string, scopeId: number | null, totalTokens: number, requests = 1,
): Promise<void> {
  const db = getDb();
  const policyEpoch = await currentPolicyEpoch();
  for (const p of ["daily", "monthly"] as const) {
    const start = periodStart(p);
    let q = db
      .from("ai_teacher_quota_counters")
      .select("id, used_requests, used_tokens")
      .eq("scope_type", scopeType)
      .eq("policy_epoch", policyEpoch)
      .eq("period_type", p)
      .eq("period_start", start);
    q = scopeId === null ? q.is("scope_id", null) : q.eq("scope_id", scopeId);
    const { data: existing } = await q.maybeSingle();
    if (existing) {
      await db.from("ai_teacher_quota_counters")
        .update({
          used_requests: (existing.used_requests || 0) + requests,
          used_tokens: (existing.used_tokens || 0) + totalTokens,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await db.from("ai_teacher_quota_counters").insert({
        scope_type: scopeType,
        scope_id: scopeId,
        policy_epoch: policyEpoch,
        period_type: p,
        period_start: start,
        used_requests: requests,
        used_tokens: totalTokens,
      });
    }
  }
}

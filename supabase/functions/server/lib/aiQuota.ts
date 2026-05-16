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

const NULLABLE_FIELDS: (keyof QuotaLimits)[] = [
  "daily_requests","weekly_requests","monthly_requests",
  "daily_tokens","weekly_tokens","monthly_tokens",
  "max_input_tokens","max_output_tokens",
];

function minDefined(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && v >= 0);
  return nums.length ? Math.min(...nums) : null;
}

export async function getEffectiveQuota(scope: AiScope): Promise<QuotaLimits> {
  const db = getDb();
  const filters: Array<{ scope_type: string; scope_id: number | null }> = [
    { scope_type: "global", scope_id: null },
  ];
  if (scope.organization_id) filters.push({ scope_type: "organization", scope_id: scope.organization_id });
  if (scope.campus_id)        filters.push({ scope_type: "campus",       scope_id: scope.campus_id });
  if (scope.class_id)         filters.push({ scope_type: "class",        scope_id: scope.class_id });
  if (scope.section_id)       filters.push({ scope_type: "section",      scope_id: scope.section_id });
  if (scope.student_id)       filters.push({ scope_type: "student",      scope_id: scope.student_id });

  const orExpr = filters
    .map((f) =>
      f.scope_id === null
        ? `and(scope_type.eq.global,scope_id.is.null)`
        : `and(scope_type.eq.${f.scope_type},scope_id.eq.${f.scope_id})`,
    )
    .join(",");

  const { data } = await db
    .from("ai_quota_policies")
    .select("daily_requests, weekly_requests, monthly_requests, daily_tokens, weekly_tokens, monthly_tokens, max_input_tokens, max_output_tokens")
    .or(orExpr);

  const rows = (data || []) as Partial<QuotaLimits>[];
  const merged: QuotaLimits = {
    daily_requests: null, weekly_requests: null, monthly_requests: null,
    daily_tokens: null, weekly_tokens: null, monthly_tokens: null,
    max_input_tokens: null, max_output_tokens: null,
  };
  for (const f of NULLABLE_FIELDS) {
    (merged as Record<string, number | null>)[f] = minDefined(rows.map((r) => r[f] as number | null | undefined));
  }
  return merged;
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

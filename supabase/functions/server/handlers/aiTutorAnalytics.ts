// supabase/functions/server/handlers/aiTutorAnalytics.ts
// Aggregate usage analytics scoped by role.
import { getDb, json, verifyToken } from "../_shared.ts";

export async function handleAiTutorAnalytics(req: Request, path: string, _url: URL): Promise<Response> {
  const user = await verifyToken(req).catch(() => null);
  if (!user) return json({ message: "Unauthorized" }, 401);
  const role = String(user.role || "");
  const userId = Number(user.id || 0);
  if (!["super_admin","org_admin","admin","teacher"].includes(role)) return json({ message: "Forbidden" }, 403);

  const db = getDb();
  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") || 30)));
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  // GET /ai-tutor/analytics/usage
  if (path === "/ai-tutor/analytics/usage" && req.method === "GET") {
    let q = db.from("ai_usage_logs")
      .select("event_type, total_tokens, latency_ms, organization_id, campus_id, subject_id, created_at")
      .gte("created_at", since)
      .limit(20000);

    if (role === "admin" || role === "teacher") {
      const tbl = role === "admin" ? "admins" : "teachers";
      const { data: u } = await db.from(tbl).select("school_id").eq("id", userId).maybeSingle();
      if (u?.school_id) q = q.eq("campus_id", u.school_id);
    } else if (role === "org_admin") {
      const { data: u } = await db.from("org_admins").select("org_id").eq("id", userId).maybeSingle();
      if (u?.org_id) q = q.eq("organization_id", u.org_id);
    }

    const { data, error } = await q;
    if (error) return json({ message: error.message }, 500);

    const rows = (data || []) as Array<{ event_type: string; total_tokens: number | null; latency_ms: number | null; created_at: string }>;
    const totals = {
      total_events: rows.length,
      queries:      rows.filter((r) => r.event_type === "query").length,
      blocked_quota: rows.filter((r) => r.event_type === "blocked_quota").length,
      blocked_scope: rows.filter((r) => r.event_type === "blocked_scope").length,
      blocked_rate:  rows.filter((r) => r.event_type === "blocked_rate_limit").length,
      no_context:    rows.filter((r) => r.event_type === "no_context").length,
      total_tokens:  rows.reduce((a, r) => a + (r.total_tokens || 0), 0),
      avg_latency_ms: rows.length ? Math.round(rows.reduce((a, r) => a + (r.latency_ms || 0), 0) / rows.length) : 0,
    };

    // Daily series
    const byDay = new Map<string, number>();
    for (const r of rows) {
      if (r.event_type !== "query") continue;
      const d = r.created_at.slice(0, 10);
      byDay.set(d, (byDay.get(d) || 0) + 1);
    }
    const series = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, count]) => ({ day, count }));

    return json({ totals, series, days });
  }

  return json({ message: "Not found" }, 404);
}

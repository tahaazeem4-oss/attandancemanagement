// supabase/functions/server/handlers/aiTutorAnalytics.ts
// Aggregate usage analytics scoped by role.
import { getDb, json, verifyToken } from "../_shared.ts";
import { getEffectiveAiAccessForUser } from "../lib/aiScope.ts";

export async function handleAiTutorAnalytics(req: Request, path: string, _url: URL): Promise<Response> {
  const user = await verifyToken(req).catch(() => null);
  if (!user) return json({ message: "Unauthorized" }, 401);
  const role = String(user.role || "");
  const userId = Number(user.id || 0);
  if (!["super_admin","org_admin","admin","teacher"].includes(role)) return json({ message: "Forbidden" }, 403);

  if (["org_admin", "admin", "teacher"].includes(role)) {
    const access = await getEffectiveAiAccessForUser(user);
    if (!access.enabled) {
      return json({ message: "AI Tutor disabled", blocked_at: access.blocked_at }, 403);
    }
  }

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

  // GET /ai-tutor/analytics/scope?node_type=&node_id=&days=
  // Drill-down usage by hierarchy node. Returns totals for the node, its
  // children (with per-child usage + top exhausted students), and a daily series.
  if (path === "/ai-tutor/analytics/scope" && req.method === "GET") {
    if (role === "teacher") return json({ message: "Forbidden" }, 403);
    const nodeType = String(url.searchParams.get("node_type") || "root");
    const nodeIdRaw = url.searchParams.get("node_id");
    const nodeId = nodeIdRaw ? Number(nodeIdRaw) : null;

    // Resolve caller's scope constraint.
    let myOrgId: number | null = null;
    let myCampusId: number | null = null;
    if (role === "org_admin") {
      const { data: u } = await db.from("org_admins").select("org_id").eq("id", userId).maybeSingle();
      myOrgId = (u?.org_id as number) || null;
    } else if (role === "admin") {
      const { data: u } = await db.from("admins").select("school_id").eq("id", userId).maybeSingle();
      myCampusId = (u?.school_id as number) || null;
    }

    // Load entity maps for child enumeration and name lookups.
    const [orgsRes, schoolsRes, classesRes, sectionsRes, studentsRes] = await Promise.all([
      db.from("organizations").select("id, name"),
      db.from("schools").select("id, name, org_id"),
      db.from("classes").select("id, class_name, school_id"),
      db.from("sections").select("id, section_name, class_id"),
      db.from("students").select("id, first_name, last_name, roll_no, section_id, class_id, school_id"),
    ]);
    type R = { id: number; [k: string]: unknown };
    const orgs = new Map<number, { id: number; name: string }>(
      ((orgsRes.data || []) as R[]).map((r) => [Number(r.id), { id: Number(r.id), name: String(r.name) }])
    );
    const schools = new Map<number, { id: number; name: string; org_id: number | null }>(
      ((schoolsRes.data || []) as R[]).map((r) => [Number(r.id), { id: Number(r.id), name: String(r.name), org_id: (r.org_id as number) ?? null }])
    );
    const classes = new Map<number, { id: number; name: string; school_id: number }>(
      ((classesRes.data || []) as R[]).map((r) => [Number(r.id), { id: Number(r.id), name: String(r.class_name), school_id: Number(r.school_id) }])
    );
    const sections = new Map<number, { id: number; name: string; class_id: number }>(
      ((sectionsRes.data || []) as R[]).map((r) => [Number(r.id), { id: Number(r.id), name: String(r.section_name), class_id: Number(r.class_id) }])
    );
    const students = new Map<number, { id: number; name: string; section_id: number; class_id: number; school_id: number }>(
      ((studentsRes.data || []) as R[]).map((r) => [Number(r.id), {
        id: Number(r.id),
        name: `${r.first_name} ${r.last_name}${r.roll_no ? ` (#${r.roll_no})` : ""}`,
        section_id: Number(r.section_id),
        class_id: Number(r.class_id),
        school_id: Number(r.school_id),
      }])
    );

    // Build the usage log query, applying both the node filter and the caller's role gate.
    let q = db.from("ai_usage_logs")
      .select("event_type, total_tokens, cost_usd, latency_ms, student_id, organization_id, campus_id, class_id, section_id, created_at")
      .gte("created_at", since)
      .limit(50000);

    // Node filter.
    let nodeName = "Everyone (system-wide)";
    let childType: "organization" | "campus" | "class" | "section" | "student" | null = null;
    let childIds: number[] = [];

    if (nodeType === "root") {
      // Root view varies by role.
      if (role === "super_admin") {
        if (orgs.size > 0) {
          childType = "organization";
          childIds = [...orgs.keys()];
        } else {
          childType = "campus";
          childIds = [...schools.keys()];
        }
      } else if (role === "org_admin" && myOrgId) {
        q = q.eq("organization_id", myOrgId);
        const o = orgs.get(myOrgId);
        nodeName = o ? `Org · ${o.name}` : "Your organization";
        childType = "campus";
        childIds = [...schools.values()].filter((s) => s.org_id === myOrgId).map((s) => s.id);
      } else if (role === "admin" && myCampusId) {
        q = q.eq("campus_id", myCampusId);
        const s = schools.get(myCampusId);
        nodeName = s ? `Campus · ${s.name}` : "Your campus";
        childType = "class";
        childIds = [...classes.values()].filter((c) => c.school_id === myCampusId).map((c) => c.id);
      }
    } else if (nodeType === "organization" && nodeId) {
      if (role === "admin") return json({ message: "Forbidden" }, 403);
      if (role === "org_admin" && myOrgId !== nodeId) return json({ message: "Forbidden" }, 403);
      q = q.eq("organization_id", nodeId);
      const o = orgs.get(nodeId);
      nodeName = o ? `Org · ${o.name}` : `Org #${nodeId}`;
      childType = "campus";
      childIds = [...schools.values()].filter((s) => s.org_id === nodeId).map((s) => s.id);
    } else if (nodeType === "campus" && nodeId) {
      const s = schools.get(nodeId);
      if (role === "admin" && myCampusId !== nodeId) return json({ message: "Forbidden" }, 403);
      if (role === "org_admin" && s && myOrgId && s.org_id !== myOrgId) return json({ message: "Forbidden" }, 403);
      q = q.eq("campus_id", nodeId);
      nodeName = s ? `Campus · ${s.name}` : `Campus #${nodeId}`;
      childType = "class";
      childIds = [...classes.values()].filter((c) => c.school_id === nodeId).map((c) => c.id);
    } else if (nodeType === "class" && nodeId) {
      const c = classes.get(nodeId);
      const s = c ? schools.get(c.school_id) : null;
      if (role === "admin" && s && myCampusId !== s.id) return json({ message: "Forbidden" }, 403);
      if (role === "org_admin" && s && myOrgId && s.org_id !== myOrgId) return json({ message: "Forbidden" }, 403);
      q = q.eq("class_id", nodeId);
      nodeName = c ? `Class · ${c.name}` : `Class #${nodeId}`;
      childType = "section";
      childIds = [...sections.values()].filter((sec) => sec.class_id === nodeId).map((sec) => sec.id);
    } else if (nodeType === "section" && nodeId) {
      const sec = sections.get(nodeId);
      const c = sec ? classes.get(sec.class_id) : null;
      const s = c ? schools.get(c.school_id) : null;
      if (role === "admin" && s && myCampusId !== s.id) return json({ message: "Forbidden" }, 403);
      if (role === "org_admin" && s && myOrgId && s.org_id !== myOrgId) return json({ message: "Forbidden" }, 403);
      q = q.eq("section_id", nodeId);
      nodeName = sec ? `Section · ${sec.name}` : `Section #${nodeId}`;
      childType = "student";
      childIds = [...students.values()].filter((st) => st.section_id === nodeId).map((st) => st.id);
    } else if (nodeType === "student" && nodeId) {
      const st = students.get(nodeId);
      const s = st ? schools.get(st.school_id) : null;
      if (role === "admin" && s && myCampusId !== s.id) return json({ message: "Forbidden" }, 403);
      if (role === "org_admin" && s && myOrgId && s.org_id !== myOrgId) return json({ message: "Forbidden" }, 403);
      q = q.eq("student_id", nodeId);
      nodeName = st ? `Student · ${st.name}` : `Student #${nodeId}`;
      childType = null;
      childIds = [];
    } else {
      return json({ message: "Invalid node" }, 400);
    }

    const { data: rowsRaw, error } = await q;
    if (error) return json({ message: error.message }, 500);
    const rows = (rowsRaw || []) as Array<{
      event_type: string; total_tokens: number | null; cost_usd: number | null;
      latency_ms: number | null; student_id: number | null;
      organization_id: number | null; campus_id: number | null;
      class_id: number | null; section_id: number | null; created_at: string;
    }>;

    // Totals for the current node.
    const totals = {
      queries:        rows.filter((r) => r.event_type === "query").length,
      blocked_quota:  rows.filter((r) => r.event_type === "blocked_quota").length,
      blocked_scope:  rows.filter((r) => r.event_type === "blocked_scope").length,
      blocked_rate:   rows.filter((r) => r.event_type === "blocked_rate_limit").length,
      no_context:     rows.filter((r) => r.event_type === "no_context").length,
      total_tokens:   rows.reduce((a, r) => a + (r.total_tokens || 0), 0),
      total_cost_usd: Number(rows.reduce((a, r) => a + Number(r.cost_usd || 0), 0).toFixed(4)),
      avg_latency_ms: rows.length ? Math.round(rows.reduce((a, r) => a + (r.latency_ms || 0), 0) / rows.length) : 0,
    };

    // Daily series (queries only).
    const byDay = new Map<string, number>();
    for (const r of rows) {
      if (r.event_type !== "query") continue;
      const d = r.created_at.slice(0, 10);
      byDay.set(d, (byDay.get(d) || 0) + 1);
    }
    const series = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, count]) => ({ day, count }));

    // Per-child rollup.
    const childKey = (r: typeof rows[number]): number | null => {
      if (childType === "organization") return r.organization_id;
      if (childType === "campus")       return r.campus_id;
      if (childType === "class")        return r.class_id;
      if (childType === "section")      return r.section_id;
      if (childType === "student")      return r.student_id;
      return null;
    };
    const childAgg = new Map<number, { queries: number; blocked_quota: number; total_tokens: number; total_cost_usd: number }>();
    for (const id of childIds) childAgg.set(id, { queries: 0, blocked_quota: 0, total_tokens: 0, total_cost_usd: 0 });
    for (const r of rows) {
      const k = childKey(r);
      if (k == null) continue;
      const slot = childAgg.get(k);
      if (!slot) continue;
      if (r.event_type === "query") slot.queries += 1;
      if (r.event_type === "blocked_quota") slot.blocked_quota += 1;
      slot.total_tokens += r.total_tokens || 0;
      slot.total_cost_usd += Number(r.cost_usd || 0);
    }
    const childName = (id: number): string => {
      if (childType === "organization") return orgs.get(id)?.name || `#${id}`;
      if (childType === "campus")       return schools.get(id)?.name || `#${id}`;
      if (childType === "class")        return classes.get(id)?.name || `#${id}`;
      if (childType === "section")      return sections.get(id)?.name || `#${id}`;
      if (childType === "student")      return students.get(id)?.name || `#${id}`;
      return `#${id}`;
    };
    const children = childType ? [...childAgg.entries()]
      .map(([id, v]) => ({
        type: childType!,
        id,
        name: childName(id),
        queries: v.queries,
        blocked_quota: v.blocked_quota,
        total_tokens: v.total_tokens,
        total_cost_usd: Number(v.total_cost_usd.toFixed(4)),
      }))
      .sort((a, b) => (b.queries + b.blocked_quota) - (a.queries + a.blocked_quota)) : [];

    // Exhausted students within this node — top by blocked_quota events.
    const studentBlocked = new Map<number, number>();
    const studentQueries = new Map<number, number>();
    for (const r of rows) {
      if (!r.student_id) continue;
      if (r.event_type === "blocked_quota") studentBlocked.set(r.student_id, (studentBlocked.get(r.student_id) || 0) + 1);
      if (r.event_type === "query")         studentQueries.set(r.student_id, (studentQueries.get(r.student_id) || 0) + 1);
    }
    const exhausted = [...studentBlocked.entries()]
      .map(([sid, blocked]) => ({
        student_id: sid,
        student_name: students.get(sid)?.name || `#${sid}`,
        blocked_count: blocked,
        queries: studentQueries.get(sid) || 0,
      }))
      .sort((a, b) => b.blocked_count - a.blocked_count)
      .slice(0, 10);

    return json({
      node: { type: nodeType, id: nodeId, name: nodeName },
      child_type: childType,
      totals,
      series,
      children,
      exhausted,
      days,
    });
  }

  return json({ message: "Not found" }, 404);
}

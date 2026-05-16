// supabase/functions/server/handlers/aiTutorAdmin.ts
// Endpoints for managing feature flags + quota policies at any scope.
import { getDb, json, verifyToken } from "../_shared.ts";

const ALLOWED_SCOPES = ["global","organization","campus","class","section","student"] as const;
type ScopeType = typeof ALLOWED_SCOPES[number];

function canManage(role: string, scopeType: ScopeType): boolean {
  if (role === "super_admin") return true;
  if (role === "org_admin")   return ["organization","campus","class","section","student"].includes(scopeType);
  if (role === "admin")       return ["campus","class","section","student"].includes(scopeType);
  return false;
}

export async function handleAiTutorAdmin(req: Request, path: string, _url: URL): Promise<Response> {
  const user = await verifyToken(req).catch(() => null);
  if (!user) return json({ message: "Unauthorized" }, 401);
  const role = String(user.role || "");
  const userId = Number(user.id || 0);
  const db = getDb();

  // POST /ai-tutor/admin/feature-flag
  if (path === "/ai-tutor/admin/feature-flag" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const scope_type = String(b.scope_type || "") as ScopeType;
    const scope_id   = b.scope_id === null || b.scope_id === undefined ? null : Number(b.scope_id);
    const is_enabled = Boolean(b.is_enabled);
    const reason     = b.reason ? String(b.reason) : null;
    if (!ALLOWED_SCOPES.includes(scope_type)) return json({ message: "Invalid scope_type" }, 400);
    if (!canManage(role, scope_type))         return json({ message: "Forbidden" }, 403);
    if (scope_type === "global" && scope_id !== null) return json({ message: "scope_id must be null for global" }, 400);
    if (scope_type !== "global" && !scope_id)         return json({ message: "scope_id required" }, 400);

    const { data, error } = await db.from("ai_feature_flags").upsert({
      scope_type, scope_id, is_enabled, reason,
      updated_by_role: role, updated_by_id: userId, updated_at: new Date().toISOString(),
    }, { onConflict: "scope_type,scope_id" }).select().single();
    if (error) return json({ message: error.message }, 500);
    return json({ flag: data });
  }

  // GET /ai-tutor/admin/feature-flags?scope_type=&scope_id=
  if (path === "/ai-tutor/admin/feature-flags" && req.method === "GET") {
    const url = new URL(req.url);
    const scope_type = url.searchParams.get("scope_type");
    let q = db.from("ai_feature_flags").select("*").order("updated_at", { ascending: false });
    if (scope_type) q = q.eq("scope_type", scope_type);
    const { data, error } = await q;
    if (error) return json({ message: error.message }, 500);
    return json({ flags: data });
  }

  // POST /ai-tutor/admin/quota-policy
  if (path === "/ai-tutor/admin/quota-policy" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const scope_type = String(b.scope_type || "") as ScopeType;
    const scope_id   = b.scope_id === null || b.scope_id === undefined ? null : Number(b.scope_id);
    if (!ALLOWED_SCOPES.includes(scope_type)) return json({ message: "Invalid scope_type" }, 400);
    if (!canManage(role, scope_type))         return json({ message: "Forbidden" }, 403);
    if (scope_type === "global" && scope_id !== null) return json({ message: "scope_id must be null for global" }, 400);
    if (scope_type !== "global" && !scope_id)         return json({ message: "scope_id required" }, 400);

    const numOrNull = (v: unknown) => v === null || v === undefined || v === "" ? null : Number(v);
    const row = {
      scope_type, scope_id,
      daily_requests:    numOrNull(b.daily_requests),
      weekly_requests:   numOrNull(b.weekly_requests),
      monthly_requests:  numOrNull(b.monthly_requests),
      daily_tokens:      numOrNull(b.daily_tokens),
      weekly_tokens:     numOrNull(b.weekly_tokens),
      monthly_tokens:    numOrNull(b.monthly_tokens),
      max_input_tokens:  numOrNull(b.max_input_tokens),
      max_output_tokens: numOrNull(b.max_output_tokens),
      updated_by_role: role, updated_by_id: userId, updated_at: new Date().toISOString(),
    };
    const { data, error } = await db.from("ai_quota_policies").upsert(row, { onConflict: "scope_type,scope_id" }).select().single();
    if (error) return json({ message: error.message }, 500);
    return json({ policy: data });
  }

  // GET /ai-tutor/admin/quota-policies?scope_type=
  if (path === "/ai-tutor/admin/quota-policies" && req.method === "GET") {
    const url = new URL(req.url);
    const scope_type = url.searchParams.get("scope_type");
    let q = db.from("ai_quota_policies").select("*").order("updated_at", { ascending: false });
    if (scope_type) q = q.eq("scope_type", scope_type);
    const { data, error } = await q;
    if (error) return json({ message: error.message }, 500);
    return json({ policies: data });
  }

  // DELETE /ai-tutor/admin/scope?scope_type=&scope_id=&target=both|flag|policy
  if (path === "/ai-tutor/admin/scope" && req.method === "DELETE") {
    const url = new URL(req.url);
    const scope_type = String(url.searchParams.get("scope_type") || "") as ScopeType;
    const sidRaw = url.searchParams.get("scope_id");
    const scope_id = sidRaw === null || sidRaw === "" || sidRaw === "null" ? null : Number(sidRaw);
    const target = String(url.searchParams.get("target") || "both");
    if (!ALLOWED_SCOPES.includes(scope_type)) return json({ message: "Invalid scope_type" }, 400);
    if (!canManage(role, scope_type))         return json({ message: "Forbidden" }, 403);
    if (scope_type === "global") return json({ message: "Global defaults cannot be deleted" }, 400);
    if (!scope_id)               return json({ message: "scope_id required" }, 400);

    const results: Record<string, unknown> = {};
    if (target === "both" || target === "flag") {
      const { error } = await db.from("ai_feature_flags").delete().eq("scope_type", scope_type).eq("scope_id", scope_id);
      results.flag = error ? { ok: false, message: error.message } : { ok: true };
    }
    if (target === "both" || target === "policy") {
      const { error } = await db.from("ai_quota_policies").delete().eq("scope_type", scope_type).eq("scope_id", scope_id);
      results.policy = error ? { ok: false, message: error.message } : { ok: true };
    }
    return json({ deleted: true, ...results });
  }

  // GET /ai-tutor/admin/health
  if (path === "/ai-tutor/admin/health" && req.method === "GET") {
    if (!["super_admin", "org_admin", "admin"].includes(role)) {
      return json({ message: "Forbidden" }, 403);
    }
    const openai_key_set    = Boolean(Deno.env.get("OPENAI_API_KEY"));
    const cron_secret_set   = Boolean(Deno.env.get("AI_TUTOR_CRON_SECRET"));
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count: pending_jobs } = await db
      .from("ai_document_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    const { count: failed_jobs_last_24h } = await db
      .from("ai_document_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("updated_at", since);

    const { count: ready_documents } = await db
      .from("ai_documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "ready");

    return json({
      openai_key_set,
      cron_secret_set,
      pending_jobs: pending_jobs ?? 0,
      failed_jobs_last_24h: failed_jobs_last_24h ?? 0,
      ready_documents: ready_documents ?? 0,
    });
  }

  // GET /ai-tutor/admin/scope-options?type=organization|campus|class|section|student&parent_id=
  // Returns [{ id, name, parent_id? }] filtered by caller's role.
  if (path === "/ai-tutor/admin/scope-options" && req.method === "GET") {
    if (!["super_admin", "org_admin", "admin"].includes(role)) {
      return json({ message: "Forbidden" }, 403);
    }
    const url = new URL(req.url);
    const type = String(url.searchParams.get("type") || "");
    const parentIdRaw = url.searchParams.get("parent_id");
    const parentId = parentIdRaw ? Number(parentIdRaw) : null;
    const orgIdFromToken = Number(user.org_id || 0);
    const schoolIdFromToken = Number(user.school_id || 0);

    try {
      if (type === "organization") {
        if (role !== "super_admin") return json({ options: [] });
        const { data } = await db.from("organizations").select("id, name").order("name");
        return json({ options: (data || []).map((r: { id: number; name: string }) => ({ id: r.id, name: r.name })) });
      }

      if (type === "campus") {
        let q = db.from("schools").select("id, name, org_id").order("name");
        if (role === "org_admin") q = q.eq("org_id", orgIdFromToken);
        if (role === "admin")     q = q.eq("id", schoolIdFromToken);
        if (parentId) q = q.eq("org_id", parentId);
        const { data } = await q;
        return json({ options: (data || []).map((r: { id: number; name: string; org_id: number | null }) => ({ id: r.id, name: r.name, parent_id: r.org_id })) });
      }

      if (type === "class") {
        // parent_id is the campus (school) id
        let campusFilter: number | null = parentId;
        if (role === "admin") campusFilter = schoolIdFromToken;
        if (!campusFilter) return json({ options: [], message: "Pick a campus first" });
        const { data } = await db.from("classes").select("id, class_name, school_id").eq("school_id", campusFilter).order("class_name");
        return json({ options: (data || []).map((r: { id: number; class_name: string; school_id: number }) => ({ id: r.id, name: r.class_name, parent_id: r.school_id })) });
      }

      if (type === "section") {
        if (!parentId) return json({ options: [], message: "Pick a class first" });
        const { data } = await db.from("sections").select("id, section_name, class_id").eq("class_id", parentId).order("section_name");
        return json({ options: (data || []).map((r: { id: number; section_name: string; class_id: number }) => ({ id: r.id, name: r.section_name, parent_id: r.class_id })) });
      }

      if (type === "student") {
        if (!parentId) return json({ options: [], message: "Pick a section first" });
        const { data } = await db.from("students")
          .select("id, first_name, last_name, roll_no, section_id")
          .eq("section_id", parentId)
          .order("first_name");
        return json({ options: (data || []).map((r: { id: number; first_name: string; last_name: string; roll_no: string | null; section_id: number }) => ({
          id: r.id,
          name: `${r.first_name} ${r.last_name}${r.roll_no ? ` (#${r.roll_no})` : ""}`,
          parent_id: r.section_id,
        })) });
      }

      return json({ message: "Unknown type" }, 400);
    } catch (err) {
      console.error("[ai-tutor scope-options]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // GET /ai-tutor/admin/policy-summary
  // Returns flags + policies joined with human-readable names for each scope_id.
  if (path === "/ai-tutor/admin/policy-summary" && req.method === "GET") {
    if (!["super_admin", "org_admin", "admin"].includes(role)) {
      return json({ message: "Forbidden" }, 403);
    }
    const orgIdFromToken = Number(user.org_id || 0);
    const schoolIdFromToken = Number(user.school_id || 0);

    try {
      const [flagsRes, policiesRes, orgsRes, schoolsRes, classesRes, sectionsRes, studentsRes] = await Promise.all([
        db.from("ai_feature_flags").select("*"),
        db.from("ai_quota_policies").select("*"),
        db.from("organizations").select("id, name"),
        db.from("schools").select("id, name, org_id"),
        db.from("classes").select("id, class_name, school_id"),
        db.from("sections").select("id, section_name, class_id"),
        db.from("students").select("id, first_name, last_name, roll_no, section_id, class_id, school_id"),
      ]);

      type Row = { id: number; [k: string]: unknown };
      const orgs = new Map<number, { name: string }>(((orgsRes.data || []) as Row[]).map((r) => [Number(r.id), { name: String(r.name) }]));
      const schools = new Map<number, { name: string; org_id: number | null }>(((schoolsRes.data || []) as Row[]).map((r) => [Number(r.id), { name: String(r.name), org_id: r.org_id as number | null }]));
      const classes = new Map<number, { name: string; school_id: number }>(((classesRes.data || []) as Row[]).map((r) => [Number(r.id), { name: String(r.class_name), school_id: Number(r.school_id) }]));
      const sections = new Map<number, { name: string; class_id: number }>(((sectionsRes.data || []) as Row[]).map((r) => [Number(r.id), { name: String(r.section_name), class_id: Number(r.class_id) }]));
      const students = new Map<number, { name: string; school_id: number; class_id: number; section_id: number }>(((studentsRes.data || []) as Row[]).map((r) => [Number(r.id), {
        name: `${r.first_name} ${r.last_name}${r.roll_no ? ` (#${r.roll_no})` : ""}`,
        school_id: Number(r.school_id),
        class_id: Number(r.class_id),
        section_id: Number(r.section_id),
      }]));

      const resolveName = (st: string, sid: number | null): string => {
        if (!sid) return "Everyone (global default)";
        if (st === "organization") return orgs.get(sid)?.name ? `Org: ${orgs.get(sid)!.name}` : `Org #${sid}`;
        if (st === "campus")       return schools.get(sid)?.name ? `Campus: ${schools.get(sid)!.name}` : `Campus #${sid}`;
        if (st === "class") {
          const c = classes.get(sid);
          const campusName = c ? schools.get(c.school_id)?.name : null;
          return c ? `Class: ${c.name}${campusName ? ` · ${campusName}` : ""}` : `Class #${sid}`;
        }
        if (st === "section") {
          const s = sections.get(sid);
          const c = s ? classes.get(s.class_id) : null;
          return s ? `Section: ${c ? `${c.name} - ` : ""}${s.name}` : `Section #${sid}`;
        }
        if (st === "student") {
          const st2 = students.get(sid);
          return st2 ? `Student: ${st2.name}` : `Student #${sid}`;
        }
        return `${st} #${sid}`;
      };

      // Role-based visibility
      const inOrg = (st: string, sid: number | null): boolean => {
        if (role === "super_admin") return true;
        if (!sid) return st === "global"; // org_admin/admin only see their own org's global default? hide global by default
        if (role === "org_admin") {
          if (st === "organization") return orgs.has(sid) ? Number((orgsRes.data as Row[]).find((r) => Number(r.id) === sid)?.id) === orgIdFromToken : false;
          if (st === "campus")       return schools.get(sid)?.org_id === orgIdFromToken;
          if (st === "class")        return classes.get(sid) ? schools.get(classes.get(sid)!.school_id)?.org_id === orgIdFromToken : false;
          if (st === "section")      { const s = sections.get(sid); const c = s ? classes.get(s.class_id) : null; return c ? schools.get(c.school_id)?.org_id === orgIdFromToken : false; }
          if (st === "student")      return students.get(sid) ? schools.get(students.get(sid)!.school_id)?.org_id === orgIdFromToken : false;
          return false;
        }
        if (role === "admin") {
          if (st === "campus")  return sid === schoolIdFromToken;
          if (st === "class")   return classes.get(sid)?.school_id === schoolIdFromToken;
          if (st === "section") { const s = sections.get(sid); return s ? classes.get(s.class_id)?.school_id === schoolIdFromToken : false; }
          if (st === "student") return students.get(sid)?.school_id === schoolIdFromToken;
          return false;
        }
        return false;
      };

      const flagsBy = new Map<string, Row>();
      for (const f of (flagsRes.data || []) as Row[]) flagsBy.set(`${f.scope_type}#${f.scope_id ?? "null"}`, f);
      const policiesBy = new Map<string, Row>();
      for (const p of (policiesRes.data || []) as Row[]) policiesBy.set(`${p.scope_type}#${p.scope_id ?? "null"}`, p);

      const keys = new Set<string>([...flagsBy.keys(), ...policiesBy.keys()]);
      const rows: Array<Record<string, unknown>> = [];
      for (const k of keys) {
        const f = flagsBy.get(k);
        const p = policiesBy.get(k);
        const st = String((f?.scope_type ?? p?.scope_type) || "");
        const sidRaw = (f?.scope_id ?? p?.scope_id) as number | null | undefined;
        const sid = sidRaw === null || sidRaw === undefined ? null : Number(sidRaw);
        if (!inOrg(st, sid)) continue;
        rows.push({
          scope_type: st,
          scope_id: sid,
          scope_name: resolveName(st, sid),
          is_enabled: f ? Boolean(f.is_enabled) : null,
          daily_requests: p?.daily_requests ?? null,
          weekly_requests: p?.weekly_requests ?? null,
          monthly_requests: p?.monthly_requests ?? null,
          daily_tokens: p?.daily_tokens ?? null,
          weekly_tokens: p?.weekly_tokens ?? null,
          monthly_tokens: p?.monthly_tokens ?? null,
          max_input_tokens: p?.max_input_tokens ?? null,
          max_output_tokens: p?.max_output_tokens ?? null,
          updated_at: (p?.updated_at || f?.updated_at) ?? null,
        });
      }
      // Order: global, organization, campus, class, section, student, then by name
      const order: Record<string, number> = { global: 0, organization: 1, campus: 2, class: 3, section: 4, student: 5 };
      rows.sort((a, b) => {
        const da = order[String(a.scope_type)] ?? 9;
        const db_ = order[String(b.scope_type)] ?? 9;
        if (da !== db_) return da - db_;
        return String(a.scope_name).localeCompare(String(b.scope_name));
      });
      return json({ rows });
    } catch (err) {
      console.error("[ai-tutor policy-summary]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}

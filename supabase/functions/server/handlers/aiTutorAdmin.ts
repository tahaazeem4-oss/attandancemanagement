// supabase/functions/server/handlers/aiTutorAdmin.ts
// Endpoints for managing feature flags + quota policies at any scope.
import { getDb, json, verifyToken } from "../_shared.ts";
import { resolveParentPoolFor, DISTRIBUTABLE, NON_DISTRIBUTABLE, ALL_FIELDS, type PolicyField } from "../lib/aiPolicyResolver.ts";

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

  // POST /ai-tutor/admin/feature-flag/bulk
  // body: { scope_type, scope_ids:number[], is_enabled, reason? }
  if (path === "/ai-tutor/admin/feature-flag/bulk" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const scope_type = String(b.scope_type || "") as ScopeType;
    const ids: number[] = Array.isArray(b.scope_ids) ? b.scope_ids.map((x: unknown) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0) : [];
    const is_enabled = Boolean(b.is_enabled);
    const reason     = b.reason ? String(b.reason) : null;
    if (!ALLOWED_SCOPES.includes(scope_type) || scope_type === "global") return json({ message: "Bulk requires a non-global scope_type" }, 400);
    if (!canManage(role, scope_type)) return json({ message: "Forbidden" }, 403);
    if (!ids.length) return json({ message: "scope_ids must be a non-empty array" }, 400);

    const now = new Date().toISOString();
    const rows = ids.map((sid) => ({
      scope_type, scope_id: sid, is_enabled, reason,
      updated_by_role: role, updated_by_id: userId, updated_at: now,
    }));
    const { data, error } = await db.from("ai_feature_flags").upsert(rows, { onConflict: "scope_type,scope_id" }).select();
    if (error) return json({ message: error.message }, 500);
    return json({ count: (data || []).length, flags: data });
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

    // ── Pool-cap validation ──────────────────────────────────────
    // Non-global scopes can never allocate more than the parent has available.
    // If the parent has no quota (null for that field), the child cannot set
    // a value there either — there's nothing to take from.
    if (scope_type !== "global") {
      try {
        const ctx = await resolveParentPoolFor(db, scope_type, scope_id);
        if (ctx) {
          const violations: Array<{ field: string; message: string; parent_pool: number | null; sibling_sum: number; max_allowed: number | null }> = [];
          for (const F of ALL_FIELDS as readonly PolicyField[]) {
            const newVal = row[F as keyof typeof row] as number | null;
            if (newVal === null || newVal === undefined) continue;
            if ((DISTRIBUTABLE as readonly string[]).includes(F)) {
              const parentPool = ctx.parentEffective[F];
              if (parentPool === null) {
                violations.push({
                  field: F, parent_pool: null, sibling_sum: ctx.siblingManualSum[F], max_allowed: null,
                  message: `No quota is set for "${F}" anywhere above ${ctx.parentNode.name}. Set it at a higher level first.`,
                });
                continue;
              }
              const maxAllowed = Math.max(0, parentPool - ctx.siblingManualSum[F]);
              if (newVal > maxAllowed) {
                violations.push({
                  field: F, parent_pool: parentPool, sibling_sum: ctx.siblingManualSum[F], max_allowed: maxAllowed,
                  message: `"${F}" exceeds available pool. ${ctx.parentNode.name} has ${parentPool} total; siblings already use ${ctx.siblingManualSum[F]}; you can set up to ${maxAllowed}.`,
                });
              }
            } else {
              // Per-request cap: must not exceed strictest ancestor cap.
              const cap = ctx.perRequestCap[F];
              if (cap !== null && newVal > cap) {
                violations.push({
                  field: F, parent_pool: cap, sibling_sum: 0, max_allowed: cap,
                  message: `"${F}" cannot exceed the strictest ancestor cap of ${cap}.`,
                });
              }
            }
          }
          if (violations.length) {
            return json({
              message: "Quota policy exceeds available pool. See violations.",
              violations,
              parent: ctx.parentNode,
            }, 400);
          }
        }
      } catch (e) {
        console.error("[ai-tutor quota-policy validate]", e);
        // Don't block on resolver crash — fall through to upsert.
      }
    }

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

  // POST /ai-tutor/admin/cascade-flag
  // body: { scope_type, scope_id, is_enabled, clear_subtree?: boolean }
  // Sets this node's flag and (when clear_subtree, default true) removes any
  // explicit feature-flag overrides in the entire subtree so children truly
  // inherit. This is what an admin means by "turn ON the school".
  if (path === "/ai-tutor/admin/cascade-flag" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const scope_type = String(b.scope_type || "") as ScopeType;
    const scope_id   = b.scope_id === null || b.scope_id === undefined ? null : Number(b.scope_id);
    const is_enabled = Boolean(b.is_enabled);
    const reason     = b.reason ? String(b.reason) : null;
    const clearSubtree = b.clear_subtree === undefined ? true : Boolean(b.clear_subtree);
    if (!ALLOWED_SCOPES.includes(scope_type)) return json({ message: "Invalid scope_type" }, 400);
    if (!canManage(role, scope_type))         return json({ message: "Forbidden" }, 403);
    if (scope_type === "global" && scope_id !== null) return json({ message: "scope_id must be null for global" }, 400);
    if (scope_type !== "global" && !scope_id)         return json({ message: "scope_id required" }, 400);

    // Upsert the node's own flag.
    const { error: upErr } = await db.from("ai_feature_flags").upsert({
      scope_type, scope_id, is_enabled, reason,
      updated_by_role: role, updated_by_id: userId, updated_at: new Date().toISOString(),
    }, { onConflict: "scope_type,scope_id" });
    if (upErr) return json({ message: upErr.message }, 500);

    if (!clearSubtree) return json({ ok: true, cleared: 0 });

    // Identify descendant scope rows to delete.
    let cleared = 0;
    const purge = async (t: string, ids: number[]) => {
      if (!ids.length) return;
      const { error } = await db.from("ai_feature_flags").delete().eq("scope_type", t).in("scope_id", ids);
      if (error) throw new Error(error.message);
      cleared += ids.length;
    };

    try {
      if (scope_type === "global") {
        // Wipe every non-global override.
        const { error } = await db.from("ai_feature_flags").delete().neq("scope_type", "global");
        if (error) return json({ message: error.message }, 500);
        return json({ ok: true, cleared: -1 });
      }

      // Collect ids of the subtree.
      let campusIds: number[] = [];
      let classIds: number[] = [];
      let sectionIds: number[] = [];
      let studentIds: number[] = [];

      if (scope_type === "organization") {
        const { data: s } = await db.from("schools").select("id").eq("org_id", scope_id);
        campusIds = ((s || []) as Array<{ id: number }>).map((r) => r.id);
      } else if (scope_type === "campus") {
        campusIds = [scope_id as number];
      }
      if (scope_type === "organization" || scope_type === "campus") {
        if (campusIds.length) {
          const { data: c } = await db.from("classes").select("id").in("school_id", campusIds);
          classIds = ((c || []) as Array<{ id: number }>).map((r) => r.id);
        }
      } else if (scope_type === "class") {
        classIds = [scope_id as number];
      }
      if (scope_type === "organization" || scope_type === "campus" || scope_type === "class") {
        if (classIds.length) {
          const { data: sec } = await db.from("sections").select("id").in("class_id", classIds);
          sectionIds = ((sec || []) as Array<{ id: number }>).map((r) => r.id);
        }
      } else if (scope_type === "section") {
        sectionIds = [scope_id as number];
      }
      if (scope_type === "organization" || scope_type === "campus" || scope_type === "class" || scope_type === "section") {
        if (sectionIds.length) {
          const { data: st } = await db.from("students").select("id").in("section_id", sectionIds);
          studentIds = ((st || []) as Array<{ id: number }>).map((r) => r.id);
        }
      }

      // Skip the node itself; delete only descendants.
      if (scope_type === "organization") {
        await purge("campus", campusIds);
        await purge("class",  classIds);
        await purge("section", sectionIds);
        await purge("student", studentIds);
      } else if (scope_type === "campus") {
        await purge("class",  classIds);
        await purge("section", sectionIds);
        await purge("student", studentIds);
      } else if (scope_type === "class") {
        await purge("section", sectionIds);
        await purge("student", studentIds);
      } else if (scope_type === "section") {
        await purge("student", studentIds);
      }

      return json({ ok: true, cleared });
    } catch (e) {
      return json({ message: e instanceof Error ? e.message : String(e) }, 500);
    }
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

  // GET /ai-tutor/admin/hierarchy?node_type=&node_id=
  // Returns the inheritance chain for the current node plus its children with their own overrides.
  // Walk: root -> organization -> campus -> class -> section -> student.
  if (path === "/ai-tutor/admin/hierarchy" && req.method === "GET") {
    if (!["super_admin", "org_admin", "admin"].includes(role)) {
      return json({ message: "Forbidden" }, 403);
    }
    const url = new URL(req.url);
    const nodeType = String(url.searchParams.get("node_type") || "root");
    const nodeIdRaw = url.searchParams.get("node_id");
    const nodeId = nodeIdRaw ? Number(nodeIdRaw) : null;
    const orgIdFromToken = Number(user.org_id || 0);
    const schoolIdFromToken = Number(user.school_id || 0);

    try {
      type Row = { id: number; [k: string]: unknown };
      const [flagsRes, policiesRes, orgsRes, schoolsRes, classesRes, sectionsRes, studentsRes] = await Promise.all([
        db.from("ai_feature_flags").select("*"),
        db.from("ai_quota_policies").select("*"),
        db.from("organizations").select("id, name"),
        db.from("schools").select("id, name, org_id"),
        db.from("classes").select("id, class_name, school_id"),
        db.from("sections").select("id, section_name, class_id"),
        db.from("students").select("id, first_name, last_name, roll_no, section_id, class_id, school_id"),
      ]);

      const orgs = new Map<number, { id: number; name: string }>(((orgsRes.data || []) as Row[]).map((r) => [Number(r.id), { id: Number(r.id), name: String(r.name) }]));
      const schools = new Map<number, { id: number; name: string; org_id: number | null }>(((schoolsRes.data || []) as Row[]).map((r) => [Number(r.id), { id: Number(r.id), name: String(r.name), org_id: r.org_id as number | null }]));
      const classes = new Map<number, { id: number; name: string; school_id: number }>(((classesRes.data || []) as Row[]).map((r) => [Number(r.id), { id: Number(r.id), name: String(r.class_name), school_id: Number(r.school_id) }]));
      const sections = new Map<number, { id: number; name: string; class_id: number }>(((sectionsRes.data || []) as Row[]).map((r) => [Number(r.id), { id: Number(r.id), name: String(r.section_name), class_id: Number(r.class_id) }]));
      const students = new Map<number, { id: number; name: string; section_id: number; class_id: number; school_id: number }>(((studentsRes.data || []) as Row[]).map((r) => [Number(r.id), {
        id: Number(r.id),
        name: `${r.first_name} ${r.last_name}${r.roll_no ? ` (#${r.roll_no})` : ""}`,
        section_id: Number(r.section_id),
        class_id: Number(r.class_id),
        school_id: Number(r.school_id),
      }]));

      const flagKey = (t: string, sid: number | null) => `${t}#${sid ?? "null"}`;
      const flagsBy = new Map<string, Row>();
      for (const f of (flagsRes.data || []) as Row[]) flagsBy.set(flagKey(String(f.scope_type), (f.scope_id ?? null) as number | null), f);
      const policiesBy = new Map<string, Row>();
      for (const p of (policiesRes.data || []) as Row[]) policiesBy.set(flagKey(String(p.scope_type), (p.scope_id ?? null) as number | null), p);

      const ownFlag = (t: string, sid: number | null) => {
        const f = flagsBy.get(flagKey(t, sid));
        return f ? { is_enabled: Boolean(f.is_enabled) } : null;
      };
      const ownPolicy = (t: string, sid: number | null) => {
        const p = policiesBy.get(flagKey(t, sid));
        if (!p) return null;
        return {
          daily_requests: p.daily_requests ?? null,
          weekly_requests: p.weekly_requests ?? null,
          monthly_requests: p.monthly_requests ?? null,
          daily_tokens: p.daily_tokens ?? null,
          weekly_tokens: p.weekly_tokens ?? null,
          monthly_tokens: p.monthly_tokens ?? null,
          max_input_tokens: p.max_input_tokens ?? null,
          max_output_tokens: p.max_output_tokens ?? null,
        };
      };

      // Build ancestor chain for a node, top-down (global first → current node last).
      type ChainEntry = {
        type: string; id: number | null; name: string;
        own_flag: { is_enabled: boolean } | null;
        own_policy: Record<string, number | null> | null;
      };
      const chain: ChainEntry[] = [{
        type: "global", id: null, name: "Everyone (global default)",
        own_flag: ownFlag("global", null), own_policy: ownPolicy("global", null),
      }];

      if (nodeType === "organization" && nodeId) {
        const o = orgs.get(nodeId);
        if (o) chain.push({ type: "organization", id: o.id, name: o.name, own_flag: ownFlag("organization", o.id), own_policy: ownPolicy("organization", o.id) });
      } else if (nodeType === "campus" && nodeId) {
        const s = schools.get(nodeId);
        if (s) {
          if (s.org_id) {
            const o = orgs.get(s.org_id);
            if (o) chain.push({ type: "organization", id: o.id, name: o.name, own_flag: ownFlag("organization", o.id), own_policy: ownPolicy("organization", o.id) });
          }
          chain.push({ type: "campus", id: s.id, name: s.name, own_flag: ownFlag("campus", s.id), own_policy: ownPolicy("campus", s.id) });
        }
      } else if (nodeType === "class" && nodeId) {
        const c = classes.get(nodeId);
        if (c) {
          const s = schools.get(c.school_id);
          if (s) {
            if (s.org_id) {
              const o = orgs.get(s.org_id);
              if (o) chain.push({ type: "organization", id: o.id, name: o.name, own_flag: ownFlag("organization", o.id), own_policy: ownPolicy("organization", o.id) });
            }
            chain.push({ type: "campus", id: s.id, name: s.name, own_flag: ownFlag("campus", s.id), own_policy: ownPolicy("campus", s.id) });
          }
          chain.push({ type: "class", id: c.id, name: c.name, own_flag: ownFlag("class", c.id), own_policy: ownPolicy("class", c.id) });
        }
      } else if (nodeType === "section" && nodeId) {
        const sec = sections.get(nodeId);
        if (sec) {
          const c = classes.get(sec.class_id);
          if (c) {
            const s = schools.get(c.school_id);
            if (s) {
              if (s.org_id) {
                const o = orgs.get(s.org_id);
                if (o) chain.push({ type: "organization", id: o.id, name: o.name, own_flag: ownFlag("organization", o.id), own_policy: ownPolicy("organization", o.id) });
              }
              chain.push({ type: "campus", id: s.id, name: s.name, own_flag: ownFlag("campus", s.id), own_policy: ownPolicy("campus", s.id) });
            }
            chain.push({ type: "class", id: c.id, name: c.name, own_flag: ownFlag("class", c.id), own_policy: ownPolicy("class", c.id) });
          }
          chain.push({ type: "section", id: sec.id, name: sec.name, own_flag: ownFlag("section", sec.id), own_policy: ownPolicy("section", sec.id) });
        }
      } else if (nodeType === "student" && nodeId) {
        const st = students.get(nodeId);
        if (st) {
          const sec = sections.get(st.section_id);
          const c = classes.get(st.class_id);
          const s = schools.get(st.school_id);
          if (s) {
            if (s.org_id) {
              const o = orgs.get(s.org_id);
              if (o) chain.push({ type: "organization", id: o.id, name: o.name, own_flag: ownFlag("organization", o.id), own_policy: ownPolicy("organization", o.id) });
            }
            chain.push({ type: "campus", id: s.id, name: s.name, own_flag: ownFlag("campus", s.id), own_policy: ownPolicy("campus", s.id) });
          }
          if (c) chain.push({ type: "class", id: c.id, name: c.name, own_flag: ownFlag("class", c.id), own_policy: ownPolicy("class", c.id) });
          if (sec) chain.push({ type: "section", id: sec.id, name: sec.name, own_flag: ownFlag("section", sec.id), own_policy: ownPolicy("section", sec.id) });
          chain.push({ type: "student", id: st.id, name: st.name, own_flag: ownFlag("student", st.id), own_policy: ownPolicy("student", st.id) });
        }
      }

      // Determine the children of the current node, scoped to the caller's role.
      type Child = {
        type: string; id: number; name: string;
        own_flag: { is_enabled: boolean } | null;
        own_policy: Record<string, number | null> | null;
        has_children: boolean;
      };
      const buildChildren = (): Child[] => {
        if (nodeType === "root") {
          if (role === "super_admin") {
            return Array.from(orgs.values()).map((o) => ({
              type: "organization", id: o.id, name: o.name,
              own_flag: ownFlag("organization", o.id), own_policy: ownPolicy("organization", o.id), has_children: true,
            })).sort((a, b) => a.name.localeCompare(b.name));
          }
          if (role === "org_admin") {
            const o = orgs.get(orgIdFromToken);
            if (!o) return [];
            return [{ type: "organization", id: o.id, name: o.name, own_flag: ownFlag("organization", o.id), own_policy: ownPolicy("organization", o.id), has_children: true }];
          }
          if (role === "admin") {
            const s = schools.get(schoolIdFromToken);
            if (!s) return [];
            return [{ type: "campus", id: s.id, name: s.name, own_flag: ownFlag("campus", s.id), own_policy: ownPolicy("campus", s.id), has_children: true }];
          }
          return [];
        }
        if (nodeType === "organization" && nodeId) {
          return Array.from(schools.values())
            .filter((s) => s.org_id === nodeId)
            .map((s) => ({
              type: "campus", id: s.id, name: s.name,
              own_flag: ownFlag("campus", s.id), own_policy: ownPolicy("campus", s.id), has_children: true,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
        }
        if (nodeType === "campus" && nodeId) {
          return Array.from(classes.values())
            .filter((c) => c.school_id === nodeId)
            .map((c) => ({
              type: "class", id: c.id, name: c.name,
              own_flag: ownFlag("class", c.id), own_policy: ownPolicy("class", c.id), has_children: true,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
        }
        if (nodeType === "class" && nodeId) {
          return Array.from(sections.values())
            .filter((s) => s.class_id === nodeId)
            .map((s) => ({
              type: "section", id: s.id, name: s.name,
              own_flag: ownFlag("section", s.id), own_policy: ownPolicy("section", s.id), has_children: true,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
        }
        if (nodeType === "section" && nodeId) {
          return Array.from(students.values())
            .filter((st) => st.section_id === nodeId)
            .map((st) => ({
              type: "student", id: st.id, name: st.name,
              own_flag: ownFlag("student", st.id), own_policy: ownPolicy("student", st.id), has_children: false,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
        }
        return [];
      };

      // Authorization checks for accessing a specific node.
      let authorized = true;
      if (nodeType === "organization" && nodeId) {
        if (role === "org_admin" && nodeId !== orgIdFromToken) authorized = false;
        if (role === "admin") authorized = false;
      } else if (nodeType === "campus" && nodeId) {
        const s = schools.get(nodeId);
        if (role === "org_admin" && (!s || s.org_id !== orgIdFromToken)) authorized = false;
        if (role === "admin" && nodeId !== schoolIdFromToken) authorized = false;
      } else if ((nodeType === "class" || nodeType === "section" || nodeType === "student") && nodeId) {
        let campusId: number | null = null;
        if (nodeType === "class") campusId = classes.get(nodeId)?.school_id ?? null;
        if (nodeType === "section") {
          const sec = sections.get(nodeId);
          if (sec) campusId = classes.get(sec.class_id)?.school_id ?? null;
        }
        if (nodeType === "student") campusId = students.get(nodeId)?.school_id ?? null;
        if (campusId === null) authorized = false;
        else if (role === "admin" && campusId !== schoolIdFromToken) authorized = false;
        else if (role === "org_admin") {
          const s = campusId ? schools.get(campusId) : null;
          if (!s || s.org_id !== orgIdFromToken) authorized = false;
        }
      }
      if (!authorized) return json({ message: "Forbidden" }, 403);

      // ── Pool-distribution model ────────────────────────────────────
      // Distributable fields (token / request pools) are split between
      // children pro-rata by student_count, after subtracting children's
      // manually-allocated shares. Non-distributable fields (per-request
      // caps) cascade as the strictest value down the chain.
      const DISTRIBUTABLE = ["daily_requests","weekly_requests","monthly_requests","daily_tokens","weekly_tokens","monthly_tokens"];
      const NON_DISTRIBUTABLE = ["max_input_tokens","max_output_tokens"];
      const ALL_FIELDS = [...DISTRIBUTABLE, ...NON_DISTRIBUTABLE];

      // Precompute each student's effective AI flag by walking the chain.
      // Only AI-enabled students contribute to pro-rata denominators, so a
      // subtree turned OFF contributes 0 and the rest of the pool flows to
      // its siblings.
      const globalFlagRow = flagsBy.get(flagKey("global", null));
      const globalEnabled = globalFlagRow ? Boolean(globalFlagRow.is_enabled) : false;
      const studentEnabled = new Map<number, boolean>();
      for (const st of students.values()) {
        const school = schools.get(st.school_id);
        const orgId = school?.org_id ?? null;
        const chainSteps: Array<[string, number | null]> = [["global", null]];
        if (orgId) chainSteps.push(["organization", orgId]);
        chainSteps.push(["campus", st.school_id]);
        chainSteps.push(["class", st.class_id]);
        chainSteps.push(["section", st.section_id]);
        chainSteps.push(["student", st.id]);
        let on = globalEnabled;
        for (const [t, id] of chainSteps) {
          const f = flagsBy.get(flagKey(t, id));
          if (f) on = Boolean(f.is_enabled);
        }
        studentEnabled.set(st.id, on);
      }

      // Student-count for any entity in the tree (only counts AI-enabled students).
      const studentCountFor = (type: string, id: number | null): number => {
        if (type === "student") return id !== null && studentEnabled.get(id) ? 1 : 0;
        if (type === "section" && id !== null) {
          let n = 0;
          for (const st of students.values()) if (st.section_id === id && studentEnabled.get(st.id)) n++;
          return n;
        }
        if (type === "class" && id !== null) {
          let n = 0;
          for (const st of students.values()) if (st.class_id === id && studentEnabled.get(st.id)) n++;
          return n;
        }
        if (type === "campus" && id !== null) {
          let n = 0;
          for (const st of students.values()) if (st.school_id === id && studentEnabled.get(st.id)) n++;
          return n;
        }
        if (type === "organization" && id !== null) {
          const orgSchoolIds = new Set<number>();
          for (const s of schools.values()) if (s.org_id === id) orgSchoolIds.add(s.id);
          let n = 0;
          for (const st of students.values()) if (orgSchoolIds.has(st.school_id) && studentEnabled.get(st.id)) n++;
          return n;
        }
        // global / root → all enabled students
        let n = 0;
        for (const flag of studentEnabled.values()) if (flag) n++;
        return n;
      };

      // Raw student-count (ignoring flag state) — used to show "X students" in UI.
      const studentCountRaw = (type: string, id: number | null): number => {
        if (type === "student") return 1;
        if (type === "section" && id !== null) {
          let n = 0; for (const st of students.values()) if (st.section_id === id) n++; return n;
        }
        if (type === "class" && id !== null) {
          let n = 0; for (const st of students.values()) if (st.class_id === id) n++; return n;
        }
        if (type === "campus" && id !== null) {
          let n = 0; for (const st of students.values()) if (st.school_id === id) n++; return n;
        }
        if (type === "organization" && id !== null) {
          const orgSchoolIds = new Set<number>();
          for (const s of schools.values()) if (s.org_id === id) orgSchoolIds.add(s.id);
          let n = 0; for (const st of students.values()) if (orgSchoolIds.has(st.school_id)) n++; return n;
        }
        return students.size;
      };

      // Siblings (full child set) of a given entity under its parent in the chain.
      type SibEntity = { type: string; id: number };
      const siblingsOfChainNode = (parentType: string, parentId: number | null): SibEntity[] => {
        if (parentType === "global") {
          // Children of global = all organizations.
          return Array.from(orgs.values()).map((o) => ({ type: "organization", id: o.id }));
        }
        if (parentType === "organization" && parentId !== null) {
          return Array.from(schools.values()).filter((s) => s.org_id === parentId).map((s) => ({ type: "campus", id: s.id }));
        }
        if (parentType === "campus" && parentId !== null) {
          return Array.from(classes.values()).filter((c) => c.school_id === parentId).map((c) => ({ type: "class", id: c.id }));
        }
        if (parentType === "class" && parentId !== null) {
          return Array.from(sections.values()).filter((s) => s.class_id === parentId).map((s) => ({ type: "section", id: s.id }));
        }
        if (parentType === "section" && parentId !== null) {
          return Array.from(students.values()).filter((st) => st.section_id === parentId).map((st) => ({ type: "student", id: st.id }));
        }
        return [];
      };

      // Effective policy: per-field { value, source: 'manual'|'auto'|'inherited'|'none',
      //                             from_type, from_name,
      //                             share_basis?: { my_students, non_manual_students, parent_pool, manual_sum, parent_pool_source } }
      type FieldEff = {
        value: number | null;
        source: "manual" | "auto" | "inherited" | "none";
        from_type: string;
        from_name: string;
        share_basis?: {
          my_students: number;
          non_manual_students: number;
          parent_pool: number | null;
          manual_sum: number;
          remaining: number | null;
        };
      };
      type FieldMap = Record<string, FieldEff>;

      // Walk top-down through chain to derive each node's effective pool.
      const computeEffectiveForChain = (chainEntries: ChainEntry[]): FieldMap => {
        // Initialize with global node's policy.
        let current: FieldMap = {};
        const root = chainEntries[0];
        for (const F of ALL_FIELDS) {
          const ownVal = root.own_policy?.[F];
          if (ownVal !== null && ownVal !== undefined) {
            current[F] = { value: Number(ownVal), source: "manual", from_type: "global", from_name: root.name };
          } else {
            current[F] = { value: null, source: "none", from_type: "none", from_name: "no limit" };
          }
        }

        for (let i = 1; i < chainEntries.length; i++) {
          const node = chainEntries[i];
          const parent = chainEntries[i - 1];
          const next: FieldMap = {};

          for (const F of ALL_FIELDS) {
            const ownVal = node.own_policy?.[F];
            if (ownVal !== null && ownVal !== undefined) {
              next[F] = { value: Number(ownVal), source: "manual", from_type: node.type, from_name: node.name };
              continue;
            }
            // No own value: cascade or auto-distribute.
            if (NON_DISTRIBUTABLE.includes(F)) {
              // Per-request caps cascade as-is.
              next[F] = { ...current[F] };
              if (next[F].source === "manual") next[F].source = "inherited";
              continue;
            }
            // Distributable: divide parent pool by sibling student-counts.
            const parentPool = current[F].value;
            if (parentPool === null) {
              next[F] = { value: null, source: "none", from_type: "none", from_name: "no limit" };
              continue;
            }
            const sibs = siblingsOfChainNode(parent.type, parent.id);
            let manualSum = 0;
            let nonManualStudents = 0;
            const myStudents = studentCountFor(node.type, node.id);
            let nodeIsManual = false; // already handled above; here it's auto
            for (const sib of sibs) {
              const sibPolicy = policiesBy.get(flagKey(sib.type, sib.id));
              const sibManual = sibPolicy ? (sibPolicy[F] as number | null | undefined) : null;
              if (sibManual !== null && sibManual !== undefined) {
                manualSum += Number(sibManual);
              } else {
                nonManualStudents += studentCountFor(sib.type, sib.id);
              }
            }
            const remaining = Math.max(0, parentPool - manualSum);
            const share = nonManualStudents > 0
              ? Math.floor(remaining * myStudents / nonManualStudents)
              : 0;
            next[F] = {
              value: share,
              source: "auto",
              from_type: parent.type,
              from_name: parent.name,
              share_basis: {
                my_students: myStudents,
                non_manual_students: nonManualStudents,
                parent_pool: parentPool,
                manual_sum: manualSum,
                remaining,
              },
            };
          }
          current = next;
        }
        return current;
      };

      const effPolicy: FieldMap = computeEffectiveForChain(chain);

      // Effective flag: walk chain, first non-null wins downward.
      let effFlag: { is_enabled: boolean } | null = null;
      let effFlagFrom = { type: "global", name: "Everyone (global default)" };
      for (const entry of chain) {
        if (entry.own_flag) {
          effFlag = entry.own_flag;
          effFlagFrom = { type: entry.type, name: entry.name };
        }
      }

      const currentNode = chain[chain.length - 1];
      const isRoot = nodeType === "root";

      // For each child, compute its effective pool too (one more level down).
      // Pre-compute sums over the current node's children for distributable fields.
      const rawChildren = buildChildren();
      const childStudentCounts: Record<string, number> = {};
      for (const c of rawChildren) {
        childStudentCounts[`${c.type}#${c.id}`] = studentCountFor(c.type, c.id);
      }
      // Manual sum and non-manual student total at the current-node level.
      const manualByField: Record<string, number> = {};
      const nonManualStudentsByField: Record<string, number> = {};
      for (const F of DISTRIBUTABLE) {
        manualByField[F] = 0;
        nonManualStudentsByField[F] = 0;
        for (const c of rawChildren) {
          const ownVal = c.own_policy?.[F];
          if (ownVal !== null && ownVal !== undefined) manualByField[F] += Number(ownVal);
          else nonManualStudentsByField[F] += childStudentCounts[`${c.type}#${c.id}`];
        }
      }

      const enrichedChildren = rawChildren.map((c) => {
        const my = childStudentCounts[`${c.type}#${c.id}`];
        const myTotal = studentCountRaw(c.type, c.id);
        const allocation: FieldMap = {};
        for (const F of ALL_FIELDS) {
          const ownVal = c.own_policy?.[F];
          if (ownVal !== null && ownVal !== undefined) {
            allocation[F] = { value: Number(ownVal), source: "manual", from_type: c.type, from_name: c.name };
            continue;
          }
          if (NON_DISTRIBUTABLE.includes(F)) {
            allocation[F] = { ...effPolicy[F] };
            if (allocation[F].source === "manual") allocation[F].source = "inherited";
            continue;
          }
          const parentPool = effPolicy[F].value;
          if (parentPool === null) {
            allocation[F] = { value: null, source: "none", from_type: "none", from_name: "no limit" };
            continue;
          }
          const remaining = Math.max(0, parentPool - manualByField[F]);
          const nonMan = nonManualStudentsByField[F];
          const share = nonMan > 0 ? Math.floor(remaining * my / nonMan) : 0;
          allocation[F] = {
            value: share,
            source: "auto",
            from_type: currentNode.type,
            from_name: currentNode.name,
            share_basis: {
              my_students: my,
              non_manual_students: nonMan,
              parent_pool: parentPool,
              manual_sum: manualByField[F],
              remaining,
            },
          };
        }
        return { ...c, student_count: my, student_count_total: myTotal, allocation };
      });

      // Distribution summary at current node (per distributable field).
      const distribution: Record<string, {
        parent_pool: number | null;
        manual_sum: number;
        remaining: number | null;
        non_manual_students: number;
        per_student: number | null;
      }> = {};
      for (const F of DISTRIBUTABLE) {
        const pp = effPolicy[F].value;
        const remaining = pp === null ? null : Math.max(0, pp - manualByField[F]);
        const perStudent = (remaining !== null && nonManualStudentsByField[F] > 0)
          ? Math.floor(remaining / nonManualStudentsByField[F])
          : null;
        distribution[F] = {
          parent_pool: pp,
          manual_sum: manualByField[F],
          remaining,
          non_manual_students: nonManualStudentsByField[F],
          per_student: perStudent,
        };
      }

      return json({
        is_root: isRoot,
        node: isRoot ? null : {
          type: currentNode.type,
          id: currentNode.id,
          name: currentNode.name,
          student_count: studentCountFor(currentNode.type, currentNode.id),
          student_count_total: studentCountRaw(currentNode.type, currentNode.id),
          own_flag: currentNode.own_flag,
          own_policy: currentNode.own_policy,
          effective_flag: effFlag ? { ...effFlag, from_type: effFlagFrom.type, from_name: effFlagFrom.name } : null,
          effective_policy: effPolicy,
        },
        breadcrumbs: chain.map((c) => ({ type: c.type, id: c.id, name: c.name })),
        children: enrichedChildren,
        distribution,
        meta: { distributable_fields: DISTRIBUTABLE, non_distributable_fields: NON_DISTRIBUTABLE },
      });
    } catch (err) {
      console.error("[ai-tutor hierarchy]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}

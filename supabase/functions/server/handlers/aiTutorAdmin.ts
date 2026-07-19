// supabase/functions/server/handlers/aiTutorAdmin.ts
// Endpoints for managing feature flags + quota policies at any scope.
//
// Model: "closest explicit scope wins" for feature flags (see lib/aiScope.ts).
// For student quota, daily/monthly requests+tokens are a shared pool that
// divides down the tree pro-rata by active student count, with manual
// overrides taken off the top (see lib/aiQuotaTree.ts) — everyone shares a
// fixed total budget instead of each student independently getting the full
// number. Per-request caps (max_input/output_tokens) and all teacher policy
// still use plain "closest explicit scope wins."
import { getDb, json, verifyToken } from "../_shared.ts";
import { QUOTA_FIELDS, type QuotaLimits } from "../lib/aiQuota.ts";
import { getEffectiveAiAccessForUser } from "../lib/aiScope.ts";
import { loadQuotaTree, POOLED_FIELDS, CAP_FIELDS } from "../lib/aiQuotaTree.ts";

const ALLOWED_SCOPES = ["global","organization","campus","class","section","student"] as const;
type ScopeType = typeof ALLOWED_SCOPES[number];
type ActorType = "student" | "teacher";
const TEACHER_SCOPES: ScopeType[] = ["global", "organization", "campus"];

type ScopeRow = { scope_type: string; scope_id: number | null; updated_at?: string | null; [k: string]: unknown };

function scopeKey(scopeType: string, scopeId: number | null) {
  return `${scopeType}#${scopeId ?? "null"}`;
}

function latestByScope<T extends ScopeRow>(rows: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const row of rows) out.set(scopeKey(String(row.scope_type), (row.scope_id ?? null) as number | null), row);
  return out;
}

function canManage(role: string, scopeType: ScopeType): boolean {
  if (role === "super_admin") return true;
  if (role === "org_admin")   return ["organization","campus","class","section","student"].includes(scopeType);
  if (role === "admin")       return ["campus","class","section","student"].includes(scopeType);
  return false;
}

function numericOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function policyPayloadView(row: Record<string, unknown> | null | undefined): QuotaLimits | null {
  if (!row) return null;
  const out = {} as QuotaLimits;
  for (const F of QUOTA_FIELDS) out[F] = numericOrNull(row[F]);
  return out;
}

function readQuotaDraft(body: Record<string, unknown>, scopeType: ScopeType, actorType: ActorType) {
  const row: Record<string, unknown> = {
    scope_type: scopeType,
    scope_id: body.scope_id === null || body.scope_id === undefined ? null : Number(body.scope_id),
    actor_type: actorType,
  };
  for (const F of QUOTA_FIELDS) row[F] = numericOrNull(body[F]);
  return row;
}

async function bumpQuotaEpoch(db: ReturnType<typeof getDb>): Promise<number> {
  const { data } = await db.from("ai_quota_runtime_state").select("policy_epoch").eq("singleton_id", true).maybeSingle();
  const next = Number(data?.policy_epoch || 1) + 1;
  const { error } = await db.from("ai_quota_runtime_state").upsert({ singleton_id: true, policy_epoch: next, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return next;
}

export async function handleAiTutorAdmin(req: Request, path: string, _url: URL): Promise<Response> {
  const user = await verifyToken(req).catch(() => null);
  if (!user) return json({ message: "Unauthorized" }, 401);
  const role = String(user.role || "");
  const userId = Number(user.id || 0);
  const db = getDb();

  // POST /ai-tutor/admin/feature-flag  { scope_type, scope_id, is_enabled, reason? }
  if (path === "/ai-tutor/admin/feature-flag" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const scope_type = String(b.scope_type || "") as ScopeType;
    const scope_id   = b.scope_id === null || b.scope_id === undefined ? null : Number(b.scope_id);
    const is_enabled = Boolean(b.is_enabled);
    const reason      = b.reason ? String(b.reason) : null;
    if (!ALLOWED_SCOPES.includes(scope_type)) return json({ message: "Invalid scope_type" }, 400);
    if (!canManage(role, scope_type))         return json({ message: "Forbidden" }, 403);
    if (scope_type === "global" && scope_id !== null) return json({ message: "scope_id must be null for global" }, 400);
    if (scope_type !== "global" && !scope_id)         return json({ message: "scope_id required" }, 400);

    const payload = {
      scope_type, scope_id, is_enabled, reason,
      updated_by_role: role, updated_by_id: userId, updated_at: new Date().toISOString(),
    };
    let data, error;
    if (scope_type === "global") {
      await db.from("ai_feature_flags").delete().eq("scope_type", "global").is("scope_id", null);
      ({ data, error } = await db.from("ai_feature_flags").insert(payload).select().single());
    } else {
      ({ data, error } = await db.from("ai_feature_flags").upsert(payload, { onConflict: "scope_type,scope_id" }).select().single());
    }
    if (error) return json({ message: error.message }, 500);
    const policy_epoch = await bumpQuotaEpoch(db).catch(() => null);
    return json({ flag: data, policy_epoch });
  }

  // POST /ai-tutor/admin/feature-flag/bulk  { scope_type, scope_ids:number[], is_enabled, reason? }
  if (path === "/ai-tutor/admin/feature-flag/bulk" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const scope_type = String(b.scope_type || "") as ScopeType;
    const scope_ids  = Array.isArray(b.scope_ids) ? (b.scope_ids as unknown[]).map(Number).filter(Boolean) : [];
    const is_enabled = Boolean(b.is_enabled);
    const reason      = b.reason ? String(b.reason) : null;
    if (!ALLOWED_SCOPES.includes(scope_type) || scope_type === "global") return json({ message: "Bulk requires a non-global scope_type" }, 400);
    if (!canManage(role, scope_type)) return json({ message: "Forbidden" }, 403);
    if (!scope_ids.length) return json({ message: "scope_ids required" }, 400);

    const rows = scope_ids.map((sid) => ({
      scope_type, scope_id: sid, is_enabled, reason,
      updated_by_role: role, updated_by_id: userId, updated_at: new Date().toISOString(),
    }));
    const { data, error } = await db.from("ai_feature_flags").upsert(rows, { onConflict: "scope_type,scope_id" }).select();
    if (error) return json({ message: error.message }, 500);
    const policy_epoch = await bumpQuotaEpoch(db).catch(() => null);
    return json({ flags: data, policy_epoch });
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

  // POST /ai-tutor/admin/quota-policy  { actor_type?, scope_type, scope_id, ...QUOTA_FIELDS }
  // Saving with all fields blank deletes the override (falls back to inherit).
  if (path === "/ai-tutor/admin/quota-policy" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const actor_type = (b.actor_type === "teacher" ? "teacher" : "student") as ActorType;
    const scope_type = String(b.scope_type || "") as ScopeType;
    const scope_id   = b.scope_id === null || b.scope_id === undefined ? null : Number(b.scope_id);
    if (!ALLOWED_SCOPES.includes(scope_type)) return json({ message: "Invalid scope_type" }, 400);
    if (actor_type === "teacher" && !TEACHER_SCOPES.includes(scope_type)) {
      return json({ message: "Teacher policies can only be set at global, organization, or campus scope" }, 400);
    }
    if (!canManage(role, scope_type))         return json({ message: "Forbidden" }, 403);
    if (scope_type === "global" && scope_id !== null) return json({ message: "scope_id must be null for global" }, 400);
    if (scope_type !== "global" && !scope_id)         return json({ message: "scope_id required" }, 400);

    const row = readQuotaDraft({ ...b, scope_id }, scope_type, actor_type);
    const hasAnyValue = QUOTA_FIELDS.some((F) => row[F] !== null);

    // Pool-overflow check for students: a manual allocation here plus every
    // other manually-allocated sibling can't exceed what the parent scope
    // actually has to give out.
    if (actor_type === "student" && scope_type !== "global" && hasAnyValue) {
      const tree = await loadQuotaTree();
      const ancestors = tree.ancestorChain(scope_type, scope_id);
      const parent = ancestors[ancestors.length - 2];
      const siblings = tree.childEntities(parent.type, parent.id);
      const violations: string[] = [];
      for (const F of POOLED_FIELDS) {
        const newVal = row[F] as number | null;
        if (newVal === null) continue;
        const parentPool = tree.effectivePooled(parent.type, parent.id, F).value;
        if (parentPool === null) continue; // unlimited parent — nothing to overflow
        let manualSum = newVal;
        for (const sib of siblings) {
          if (sib.type === scope_type && sib.id === scope_id) continue;
          const sibPol = tree.ownPolicy(sib.type, sib.id);
          const sibVal = sibPol ? Number(sibPol[F]) : NaN;
          if (Number.isFinite(sibVal) && tree.countActive(sib.type, sib.id) > 0) manualSum += sibVal;
        }
        if (manualSum > parentPool) {
          violations.push(`${F}: ${newVal.toLocaleString()} would push total manual allocations under ${parent.name} to ${manualSum.toLocaleString()}, but only ${parentPool.toLocaleString()} is available.`);
        }
      }
      if (violations.length) {
        return json({ message: "Not enough quota available in the parent pool.", violations }, 409);
      }
    }

    let data, error;
    if (!hasAnyValue) {
      // No fields set — remove the override entirely so this scope inherits.
      let delQ = db.from("ai_quota_policies").delete().eq("actor_type", actor_type).eq("scope_type", scope_type);
      delQ = scope_id === null ? delQ.is("scope_id", null) : delQ.eq("scope_id", scope_id);
      ({ error } = await delQ);
      data = null;
    } else {
      row.updated_by_role = role;
      row.updated_by_id = userId;
      row.updated_at = new Date().toISOString();
      ({ data, error } = await db.from("ai_quota_policies").upsert(row, { onConflict: "actor_type,scope_type,scope_id" }).select().single());
    }
    if (error) return json({ message: error.message }, 500);
    const policy_epoch = await bumpQuotaEpoch(db).catch(() => null);
    return json({ policy: data, policy_epoch });
  }

  // GET /ai-tutor/admin/quota-policies?scope_type=&actor_type=
  if (path === "/ai-tutor/admin/quota-policies" && req.method === "GET") {
    const url = new URL(req.url);
    const scope_type = url.searchParams.get("scope_type");
    const actor_type = url.searchParams.get("actor_type") || "student";
    let q = db.from("ai_quota_policies").select("*").eq("actor_type", actor_type).order("updated_at", { ascending: false });
    if (scope_type) q = q.eq("scope_type", scope_type);
    const { data, error } = await q;
    if (error) return json({ message: error.message }, 500);
    return json({ policies: data });
  }

  // POST /ai-tutor/admin/cascade-flag — optional advanced utility: set a
  // scope explicitly (or clear it back to "inherit"), and optionally wipe
  // every descendant override so the whole subtree inherits cleanly.
  // body: { scope_type, scope_id, is_enabled, mode?: 'inherit', clear_subtree?: boolean }
  if (path === "/ai-tutor/admin/cascade-flag" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const scope_type = String(b.scope_type || "") as ScopeType;
    const scope_id   = b.scope_id === null || b.scope_id === undefined ? null : Number(b.scope_id);
    const inheritMode = b.is_enabled === null || b.mode === "inherit";
    const is_enabled = inheritMode ? null : Boolean(b.is_enabled);
    const reason     = b.reason ? String(b.reason) : null;
    const clearSubtree = Boolean(b.clear_subtree);
    if (!ALLOWED_SCOPES.includes(scope_type)) return json({ message: "Invalid scope_type" }, 400);
    if (!canManage(role, scope_type))         return json({ message: "Forbidden" }, 403);
    if (scope_type === "global" && scope_id !== null) return json({ message: "scope_id must be null for global" }, 400);
    if (scope_type !== "global" && !scope_id)         return json({ message: "scope_id required" }, 400);
    if (inheritMode && scope_type === "global") return json({ message: "Global scope cannot inherit from a parent" }, 400);

    let upErr;
    if (inheritMode) {
      ({ error: upErr } = await db.from("ai_feature_flags").delete().eq("scope_type", scope_type).eq("scope_id", scope_id));
    } else if (scope_type === "global") {
      const cascadePayload = {
        scope_type, scope_id, is_enabled, reason,
        updated_by_role: role, updated_by_id: userId, updated_at: new Date().toISOString(),
      };
      ({ error: upErr } = await db.from("ai_feature_flags").delete().eq("scope_type", "global").is("scope_id", null));
      if (!upErr) ({ error: upErr } = await db.from("ai_feature_flags").insert(cascadePayload));
    } else {
      const cascadePayload = {
        scope_type, scope_id, is_enabled, reason,
        updated_by_role: role, updated_by_id: userId, updated_at: new Date().toISOString(),
      };
      ({ error: upErr } = await db.from("ai_feature_flags").upsert(cascadePayload, { onConflict: "scope_type,scope_id" }));
    }
    if (upErr) return json({ message: upErr.message }, 500);

    if (!clearSubtree) {
      const policy_epoch = await bumpQuotaEpoch(db).catch(() => null);
      return json({ ok: true, cleared: 0, policy_epoch });
    }

    let cleared = 0;
    const purge = async (t: string, ids: number[]) => {
      if (!ids.length) return;
      const { error } = await db.from("ai_feature_flags").delete().eq("scope_type", t).in("scope_id", ids);
      if (error) throw new Error(error.message);
      cleared += ids.length;
    };

    try {
      if (scope_type === "global") {
        const { error } = await db.from("ai_feature_flags").delete().neq("scope_type", "global");
        if (error) return json({ message: error.message }, 500);
        const policy_epoch = await bumpQuotaEpoch(db).catch(() => null);
        return json({ ok: true, cleared: -1, policy_epoch });
      }

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

      const policy_epoch = await bumpQuotaEpoch(db).catch(() => null);
      return json({ ok: true, cleared, policy_epoch });
    } catch (e) {
      return json({ message: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  // DELETE /ai-tutor/admin/scope?scope_type=&scope_id=&target=both|flag|policy&actor_type=
  if (path === "/ai-tutor/admin/scope" && req.method === "DELETE") {
    const url = new URL(req.url);
    const scope_type = String(url.searchParams.get("scope_type") || "") as ScopeType;
    const sidRaw = url.searchParams.get("scope_id");
    const scope_id = sidRaw === null || sidRaw === "" || sidRaw === "null" ? null : Number(sidRaw);
    const target = String(url.searchParams.get("target") || "both");
    const actor_type = (url.searchParams.get("actor_type") === "teacher" ? "teacher" : "student") as ActorType;
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
      const { error } = await db.from("ai_quota_policies").delete().eq("actor_type", actor_type).eq("scope_type", scope_type).eq("scope_id", scope_id);
      results.policy = error ? { ok: false, message: error.message } : { ok: true };
    }
    const policy_epoch = await bumpQuotaEpoch(db).catch(() => null);
    return json({ deleted: true, policy_epoch, ...results });
  }

  // GET /ai-tutor/admin/health
  if (path === "/ai-tutor/admin/health" && req.method === "GET") {
    if (!["super_admin", "org_admin", "admin"].includes(role)) {
      return json({ message: "Forbidden" }, 403);
    }
    const openai_key_set       = Boolean(Deno.env.get("OPENAI_API_KEY"));
    const openrouter_key_set   = Boolean(Deno.env.get("OPENROUTER_API_KEY"));
    const cron_secret_set      = Boolean(Deno.env.get("AI_TUTOR_CRON_SECRET"));
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
      openrouter_key_set,
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

  // GET /ai-tutor/admin/policy-summary?actor_type=
  // Flat list of every explicit override (flags + quota policies) joined
  // with human-readable names — read-only audit view, no math.
  if (path === "/ai-tutor/admin/policy-summary" && req.method === "GET") {
    if (!["super_admin", "org_admin", "admin"].includes(role)) {
      return json({ message: "Forbidden" }, 403);
    }
    const url = new URL(req.url);
    const actorType = url.searchParams.get("actor_type") === "teacher" ? "teacher" : "student";
    const orgIdFromToken = Number(user.org_id || 0);
    const schoolIdFromToken = Number(user.school_id || 0);

    try {
      const [flagsRes, policiesRes, orgsRes, schoolsRes, classesRes, sectionsRes, studentsRes] = await Promise.all([
        db.from("ai_feature_flags").select("*").order("updated_at", { ascending: true }),
        db.from("ai_quota_policies").select("*").eq("actor_type", actorType).order("updated_at", { ascending: true }),
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

      const inOrg = (st: string, sid: number | null): boolean => {
        if (role === "super_admin") return true;
        if (!sid) return st === "global";
        if (role === "org_admin") {
          if (st === "organization") return sid === orgIdFromToken;
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

      const flagsBy = latestByScope((flagsRes.data || []) as ScopeRow[]);
      const policiesBy = latestByScope((policiesRes.data || []) as ScopeRow[]);

      const keys = new Set<string>([...flagsBy.keys(), ...policiesBy.keys()]);
      const rows: Array<Record<string, unknown>> = [];
      for (const k of keys) {
        const f = flagsBy.get(k);
        const p = policiesBy.get(k);
        const st = String((f?.scope_type ?? p?.scope_type) || "");
        const sidRaw = (f?.scope_id ?? p?.scope_id) as number | null | undefined;
        const sid = sidRaw === null || sidRaw === undefined ? null : Number(sidRaw);
        if (!inOrg(st, sid)) continue;
        const row: Record<string, unknown> = {
          scope_type: st,
          scope_id: sid,
          scope_name: resolveName(st, sid),
          is_enabled: f ? Boolean(f.is_enabled) : null,
          updated_at: (p?.updated_at || f?.updated_at) ?? null,
        };
        for (const F of QUOTA_FIELDS) row[F] = p?.[F] ?? null;
        rows.push(row);
      }
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

  // GET /ai-tutor/admin/hierarchy?node_type=&node_id=&actor_type=
  // Returns the inheritance chain for the current node plus its children,
  // each with its own override (if any) and the effective value in force —
  // simply the closest explicit row along that node's own chain.
  if (path === "/ai-tutor/admin/hierarchy" && req.method === "GET") {
    if (!["super_admin", "org_admin", "admin"].includes(role)) {
      return json({ message: "Forbidden" }, 403);
    }
    const url = new URL(req.url);
    const nodeType = String(url.searchParams.get("node_type") || "root");
    const nodeIdRaw = url.searchParams.get("node_id");
    const nodeId = nodeIdRaw ? Number(nodeIdRaw) : null;
    const actorType = (url.searchParams.get("actor_type") === "teacher" ? "teacher" : "student") as ActorType;
    const orgIdFromToken = Number(user.org_id || 0);
    const schoolIdFromToken = Number(user.school_id || 0);
    // Teachers only have global/organization/campus scopes.
    const levels = actorType === "teacher" ? ["root", "organization", "campus"] : ["root", "organization", "campus", "class", "section", "student"];
    if (!levels.includes(nodeType)) return json({ message: "Invalid node_type for this actor_type" }, 400);

    try {
      type Row = { id: number; [k: string]: unknown };
      const [flagsRes, policiesRes, orgsRes, schoolsRes, classesRes, sectionsRes, studentsRes] = await Promise.all([
        db.from("ai_feature_flags").select("*").order("updated_at", { ascending: true }),
        db.from("ai_quota_policies").select("*").eq("actor_type", actorType).order("updated_at", { ascending: true }),
        db.from("organizations").select("id, name"),
        db.from("schools").select("id, name, org_id"),
        actorType === "teacher" ? Promise.resolve({ data: [] as Row[] }) : db.from("classes").select("id, class_name, school_id"),
        actorType === "teacher" ? Promise.resolve({ data: [] as Row[] }) : db.from("sections").select("id, section_name, class_id"),
        actorType === "teacher" ? Promise.resolve({ data: [] as Row[] }) : db.from("students").select("id, first_name, last_name, roll_no, section_id, class_id, school_id"),
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
      const flagsBy = latestByScope((flagsRes.data || []) as ScopeRow[]);
      const policiesBy = latestByScope((policiesRes.data || []) as ScopeRow[]);

      const ownFlag = (t: string, sid: number | null) => {
        const f = flagsBy.get(flagKey(t, sid));
        return f ? { is_enabled: Boolean(f.is_enabled) } : null;
      };
      const ownPolicy = (t: string, sid: number | null) => policyPayloadView(policiesBy.get(flagKey(t, sid)) || null);

      type ChainEntry = {
        type: string; id: number | null; name: string;
        own_flag: { is_enabled: boolean } | null;
        own_policy: QuotaLimits | null;
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

      type Child = {
        type: string; id: number; name: string;
        own_flag: { is_enabled: boolean } | null;
        own_policy: QuotaLimits | null;
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
              own_flag: ownFlag("campus", s.id), own_policy: ownPolicy("campus", s.id), has_children: actorType === "student",
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
        }
        if (actorType === "teacher") return []; // campus is the deepest teacher level
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

      // Effective flag: closest explicit entry in the chain, most-specific wins.
      let effFlag: { is_enabled: boolean } | null = null;
      let effFlagFrom = { type: "global", name: "Everyone (global default)" };
      for (let i = chain.length - 1; i >= 0; i--) {
        if (chain[i].own_flag) { effFlag = chain[i].own_flag; effFlagFrom = { type: chain[i].type, name: chain[i].name }; break; }
      }

      // Effective policy. Teachers: closest explicit row wins outright (no
      // pooling — teacher usage is already a shared counter by construction).
      // Students: daily/monthly requests+tokens are a pool that divides down
      // the tree (see aiQuotaTree.ts); max_input/output_tokens are per-request
      // caps and still just take the closest explicit scope.
      type FieldEff = { value: number | null; from_type: string; from_name: string; is_override: boolean; share_basis?: unknown };
      const effPolicyForTeacher = (localChain: ChainEntry[]): Record<string, FieldEff> => {
        const out: Record<string, FieldEff> = {};
        let source: ChainEntry | null = null;
        for (let i = localChain.length - 1; i >= 0; i--) {
          if (localChain[i].own_policy) { source = localChain[i]; break; }
        }
        for (const F of QUOTA_FIELDS) {
          out[F] = source
            ? { value: source.own_policy![F], from_type: source.type, from_name: source.name, is_override: source === localChain[localChain.length - 1] }
            : { value: null, from_type: "none", from_name: "unlimited", is_override: false };
        }
        return out;
      };

      const tree = actorType === "student" ? await loadQuotaTree() : null;
      const effPolicyForStudent = (nodeType_: ScopeType, nodeId: number | null): Record<string, FieldEff> => {
        const out: Record<string, FieldEff> = {};
        for (const F of POOLED_FIELDS) {
          const eff = tree!.effectivePooled(nodeType_, nodeId, F);
          out[F] = { value: eff.value, from_type: eff.from_type, from_name: eff.from_name, is_override: eff.source === "manual", share_basis: eff.share_basis };
        }
        for (const F of CAP_FIELDS) {
          const eff = tree!.effectiveCap(nodeType_, nodeId, F);
          out[F] = { value: eff.value, from_type: eff.from_type, from_name: eff.from_name, is_override: eff.is_override };
        }
        return out;
      };

      const studentCountFor = (type: string, id: number | null): number => {
        if (actorType !== "student" || !tree) return 0;
        return tree.countActive(type as ScopeType, id);
      };

      const currentNode = chain[chain.length - 1];
      const isRoot = nodeType === "root";
      const rawChildren = buildChildren();
      const effPolicy = isRoot
        ? {}
        : (actorType === "student"
            ? effPolicyForStudent(currentNode.type as ScopeType, currentNode.id)
            : effPolicyForTeacher(chain));

      const enrichedChildren = rawChildren.map((c) => {
        const childEffPolicy = actorType === "student"
          ? effPolicyForStudent(c.type as ScopeType, c.id)
          : effPolicyForTeacher([...chain, { type: c.type, id: c.id, name: c.name, own_flag: c.own_flag, own_policy: c.own_policy }]);
        return { ...c, effective_policy: childEffPolicy, student_count: studentCountFor(c.type, c.id) };
      });

      return json({
        is_root: isRoot,
        actor_type: actorType,
        context_effective_flag: effFlag ? { ...effFlag, from_type: effFlagFrom.type, from_name: effFlagFrom.name } : null,
        node: isRoot ? null : {
          type: currentNode.type,
          id: currentNode.id,
          name: currentNode.name,
          own_flag: currentNode.own_flag,
          own_policy: currentNode.own_policy,
          effective_flag: effFlag ? { ...effFlag, from_type: effFlagFrom.type, from_name: effFlagFrom.name } : null,
          effective_policy: effPolicy,
          student_count: studentCountFor(currentNode.type, currentNode.id),
        },
        breadcrumbs: chain.map((c) => ({ type: c.type, id: c.id, name: c.name })),
        children: enrichedChildren,
        meta: { quota_fields: QUOTA_FIELDS },
      });
    } catch (err) {
      console.error("[ai-tutor hierarchy]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // GET /ai-tutor/admin/provider-status
  // Returns current LLM provider key info (OpenRouter /auth/key) so the
  // SuperAdmin UI can show "what plan/key is active right now".
  if (path === "/ai-tutor/admin/provider-status" && req.method === "GET") {
    if (role !== "super_admin") return json({ message: "Forbidden" }, 403);

    const orKey   = Deno.env.get("OPENROUTER_API_KEY") || null;
    const oaKey   = Deno.env.get("OPENAI_API_KEY") || null;
    const orModel = Deno.env.get("OPENROUTER_MODEL") || "openai/gpt-4o-mini";

    const out: Record<string, unknown> = {
      provider: orKey ? "openrouter" : (oaKey ? "openai" : "none"),
      chat_model: orModel,
      has_embeddings: !!oaKey, // OpenRouter has no /embeddings endpoint
      retrieval_mode: oaKey ? "vector" : "fulltext",
    };

    if (orKey) {
      try {
        const r = await fetch("https://openrouter.ai/api/v1/auth/key", {
          headers: { Authorization: `Bearer ${orKey}` },
        });
        if (r.ok) {
          const j = await r.json();
          const d = j?.data || {};
          out.key = {
            label: d.label ?? null,
            usage_usd: typeof d.usage === "number" ? d.usage : null,
            limit_usd: typeof d.limit === "number" ? d.limit : null,
            remaining_usd:
              typeof d.limit === "number" && typeof d.usage === "number"
                ? Math.max(0, d.limit - d.usage)
                : null,
            is_free_tier: !!d.is_free_tier,
            rate_limit: d.rate_limit ?? null,
          };
        } else {
          out.key = { error: `auth/key ${r.status}` };
        }
      } catch (e) {
        out.key = { error: (e as Error).message };
      }
    }

    return json(out);
  }

  // POST /ai-tutor/admin/sync-provider-quota
  // Pulls live limits from the provider (OpenRouter /auth/key) and rewrites
  // the GLOBAL student ai_quota_policies row to match. Also bumps the policy
  // epoch so previous "limit reached" states clear instantly.
  // Body (all optional, all override the computed values):
  //   { daily_requests, monthly_requests, daily_tokens, monthly_tokens,
  //     max_input_tokens, max_output_tokens, reset_counters?: boolean (default true) }
  if (path === "/ai-tutor/admin/sync-provider-quota" && req.method === "POST") {
    if (role !== "super_admin") return json({ message: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const numOrNull = (v: unknown) => v === null || v === undefined || v === "" ? null : Number(v);

    // Fallback defaults for the GLOBAL pool (the total shared budget every
    // organization/campus/class/section/student divides). Only used when no
    // richer number can be derived from the live provider key below.
    let daily_requests:    number | null = 200;
    let monthly_requests:  number | null = 3000;
    let daily_tokens:      number | null = 200_000;
    let monthly_tokens:    number | null = 3_000_000;
    let max_input_tokens:  number | null = 4000;
    let max_output_tokens: number | null = 1200;

    const orKey = Deno.env.get("OPENROUTER_API_KEY") || null;
    let provider_snapshot: Record<string, unknown> | null = null;
    if (orKey) {
      try {
        const r = await fetch("https://openrouter.ai/api/v1/auth/key", {
          headers: { Authorization: `Bearer ${orKey}` },
        });
        if (r.ok) {
          const j = await r.json();
          const d = j?.data || {};
          provider_snapshot = d;
          const remaining = typeof d.limit === "number" && typeof d.usage === "number"
            ? Math.max(0, d.limit - d.usage)
            : null;
          if (remaining !== null && remaining > 0) {
            // remaining USD / assumed cost per 1k tokens = total tokens the
            // budget can cover — this is the GLOBAL pool total; the actual
            // student count (whatever it is) then divides it automatically.
            const totalTokens = Math.floor((remaining / 0.0005) * 1000);
            monthly_tokens = Math.max(50_000, totalTokens);
            daily_tokens   = Math.max(10_000, Math.floor(totalTokens / 28));
          }
        }
      } catch (_e) {
        // Ignore — defaults still apply.
      }
    }

    if (body.daily_requests    !== undefined) daily_requests    = numOrNull(body.daily_requests);
    if (body.monthly_requests  !== undefined) monthly_requests  = numOrNull(body.monthly_requests);
    if (body.daily_tokens      !== undefined) daily_tokens      = numOrNull(body.daily_tokens);
    if (body.monthly_tokens    !== undefined) monthly_tokens    = numOrNull(body.monthly_tokens);
    if (body.max_input_tokens  !== undefined) max_input_tokens  = numOrNull(body.max_input_tokens);
    if (body.max_output_tokens !== undefined) max_output_tokens = numOrNull(body.max_output_tokens);

    const row = {
      actor_type: "student" as const,
      scope_type: "global" as const,
      scope_id: null as number | null,
      daily_requests, monthly_requests,
      daily_tokens,   monthly_tokens,
      max_input_tokens, max_output_tokens,
      updated_by_role: role, updated_by_id: userId, updated_at: new Date().toISOString(),
    };
    await db.from("ai_quota_policies").delete().eq("actor_type", "student").eq("scope_type", "global").is("scope_id", null);
    const { data: policy, error: polErr } = await db
      .from("ai_quota_policies")
      .insert(row)
      .select()
      .single();
    if (polErr) return json({ message: polErr.message }, 500);

    const resetCounters = body.reset_counters === undefined ? true : Boolean(body.reset_counters);
    const policy_epoch = resetCounters ? await bumpQuotaEpoch(db).catch(() => null) : null;

    return json({
      policy,
      policy_epoch,
      provider: provider_snapshot,
      message: resetCounters ? "Global quota synced and counters version bumped." : "Global quota synced.",
    });
  }

  // POST /ai-tutor/admin/reset-counters
  // Bumps the policy epoch — the cheap way to make every "limit reached"
  // state clear instantly without deleting counter history.
  if (path === "/ai-tutor/admin/reset-counters" && req.method === "POST") {
    if (role !== "super_admin") return json({ message: "Forbidden" }, 403);
    const policy_epoch = await bumpQuotaEpoch(db).catch(() => null);
    return json({ policy_epoch });
  }

  return json({ message: "Not found" }, 404);
}

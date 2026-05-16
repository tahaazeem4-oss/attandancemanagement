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

  return json({ message: "Not found" }, 404);
}

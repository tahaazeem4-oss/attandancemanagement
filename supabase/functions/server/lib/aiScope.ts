// supabase/functions/server/lib/aiScope.ts
// Resolves effective access and the tenant scope path for a given user.
//
// Resolution model: "closest explicit scope wins." Every level (global →
// organization → campus → class → section → student) may have its own
// explicit ai_feature_flags row. We walk from the MOST specific level the
// caller belongs to down to global and return the first row we find — that
// single row is authoritative, no merging across levels. No row anywhere
// means enabled by default. This replaces an older model where only
// explicit `false` mattered and only broad-to-narrow, which made a child
// scope unable to ever override a disabled ancestor.
import { getDb } from "../_shared.ts";

export interface AiScope {
  role: string;
  user_id: number;
  student_id?: number;
  organization_id?: number;
  campus_id?: number;
  class_id?: number;
  section_id?: number;
  class_name?: string;
  section_name?: string;
}

export interface EffectiveAccess {
  enabled: boolean;
  blocked_at?: "global" | "organization" | "campus" | "class" | "section" | "student";
}

export interface EffectiveAccessWithScope extends EffectiveAccess {
  scope?: AiScope;
}

// Ordered most-specific → least-specific. Used everywhere a "closest scope
// wins" walk is needed (feature flags, quota policies).
export function buildScopeChain(scope: AiScope): Array<{ type: string; id: number | null }> {
  const c: Array<{ type: string; id: number | null }> = [];
  if (scope.student_id)       c.push({ type: "student",      id: scope.student_id });
  if (scope.section_id)       c.push({ type: "section",      id: scope.section_id });
  if (scope.class_id)         c.push({ type: "class",        id: scope.class_id });
  if (scope.campus_id)        c.push({ type: "campus",       id: scope.campus_id });
  if (scope.organization_id)  c.push({ type: "organization", id: scope.organization_id });
  c.push({ type: "global", id: null });
  return c;
}

function scopeOrFilter(chain: Array<{ type: string; id: number | null }>): string {
  return chain
    .map((c) => (c.id === null
      ? `and(scope_type.eq.global,scope_id.is.null)`
      : `and(scope_type.eq.${c.type},scope_id.eq.${c.id})`))
    .join(",");
}

/** Resolve effective enabled/disabled for a scope: closest explicit row wins. */
export async function getEffectiveAiAccess(scope: AiScope): Promise<EffectiveAccess> {
  const db = getDb();
  const chain = buildScopeChain(scope);

  const { data, error } = await db
    .from("ai_feature_flags")
    .select("scope_type, scope_id, is_enabled")
    .or(scopeOrFilter(chain));

  if (error) {
    console.error("[aiScope] flag lookup failed", error);
    return { enabled: false, blocked_at: "global" };
  }

  const flagMap = new Map<string, boolean>();
  for (const row of (data || []) as Array<{ scope_type: string; scope_id: number | null; is_enabled: boolean }>) {
    flagMap.set(`${row.scope_type}:${row.scope_id ?? "null"}`, row.is_enabled);
  }

  for (const pair of chain) {
    const key = `${pair.type}:${pair.id ?? "null"}`;
    if (flagMap.has(key)) {
      const enabled = flagMap.get(key)!;
      return enabled ? { enabled: true } : { enabled: false, blocked_at: pair.type as EffectiveAccess["blocked_at"] };
    }
  }

  // No explicit row anywhere in the chain — enabled by default.
  return { enabled: true };
}

/** Resolve a student's full scope chain. */
export async function resolveStudentScope(studentId: number): Promise<AiScope | null> {
  const db = getDb();
  const { data, error } = await db
    .from("students")
    .select(`
      id, school_id, class_id, section_id,
      classes:class_id(id, class_name, school_id),
      sections:section_id(id, section_name, class_id),
      schools:school_id(org_id)
    `)
    .eq("id", studentId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Record<string, unknown> as {
    id: number;
    school_id: number;
    class_id: number;
    section_id: number;
    classes?: { id?: number; class_name?: string; school_id?: number } | null;
    sections?: { id?: number; section_name?: string; class_id?: number } | null;
    schools?: { org_id?: number } | null;
  };

  // Prefer class->school linkage as source of truth for campus scope.
  // This avoids incorrect flag resolution when students.school_id is stale.
  const resolvedCampusId = row.classes?.school_id ?? row.school_id;
  let resolvedOrgId = row.schools?.org_id;
  if (resolvedCampusId && resolvedCampusId !== row.school_id) {
    const { data: campus } = await db
      .from("schools")
      .select("org_id")
      .eq("id", resolvedCampusId)
      .maybeSingle();
    resolvedOrgId = campus?.org_id ?? resolvedOrgId;
  }

  return {
    role: "student",
    user_id: row.id,
    student_id: row.id,
    organization_id: resolvedOrgId,
    campus_id: resolvedCampusId,
    class_id: row.class_id,
    section_id: row.section_id,
    class_name: row.classes?.class_name,
    section_name: row.sections?.section_name,
  };
}

async function resolveAdminScope(adminId: number): Promise<AiScope | null> {
  const db = getDb();
  const { data: admin } = await db
    .from("admins")
    .select("id, school_id")
    .eq("id", adminId)
    .maybeSingle();
  if (!admin?.school_id) return null;

  const { data: school } = await db
    .from("schools")
    .select("id, org_id")
    .eq("id", admin.school_id)
    .maybeSingle();

  return {
    role: "admin",
    user_id: admin.id,
    organization_id: school?.org_id,
    campus_id: admin.school_id,
  };
}

async function resolveOrgAdminScope(orgAdminId: number): Promise<AiScope | null> {
  const db = getDb();
  const { data: oa } = await db
    .from("org_admins")
    .select("id, org_id")
    .eq("id", orgAdminId)
    .maybeSingle();
  if (!oa?.org_id) return null;

  return {
    role: "org_admin",
    user_id: oa.id,
    organization_id: oa.org_id,
  };
}

export async function resolveTeacherBaseScope(teacherId: number): Promise<AiScope | null> {
  const db = getDb();
  const { data: teacher } = await db
    .from("teachers")
    .select("id, school_id")
    .eq("id", teacherId)
    .maybeSingle();
  if (!teacher?.school_id) return null;

  const { data: school } = await db
    .from("schools")
    .select("id, org_id")
    .eq("id", teacher.school_id)
    .maybeSingle();

  return {
    role: "teacher",
    user_id: teacher.id,
    organization_id: school?.org_id,
    campus_id: teacher.school_id,
  };
}

export async function getEffectiveAiAccessForUser(user: Record<string, unknown>): Promise<EffectiveAccessWithScope> {
  const role = String(user.role || "");
  const userId = Number(user.id || 0);

  if (role === "super_admin") {
    const scope: AiScope = { role: "super_admin", user_id: userId };
    const access = await getEffectiveAiAccess(scope);
    return { ...access, scope };
  }

  if (role === "org_admin") {
    const scope = await resolveOrgAdminScope(userId);
    if (!scope) return { enabled: false, blocked_at: "organization" };
    const access = await getEffectiveAiAccess(scope);
    return { ...access, scope };
  }

  if (role === "admin") {
    const scope = await resolveAdminScope(userId);
    if (!scope) return { enabled: false, blocked_at: "campus" };
    const access = await getEffectiveAiAccess(scope);
    return { ...access, scope };
  }

  if (role === "teacher") {
    const baseScope = await resolveTeacherBaseScope(userId);
    if (!baseScope) return { enabled: false, blocked_at: "campus" };

    // Base chain check: global -> org -> campus.
    const baseAccess = await getEffectiveAiAccess(baseScope);
    if (!baseAccess.enabled) return { ...baseAccess, scope: baseScope };

    // Class/section overrides: if any mapped assignment is explicitly ON,
    // the teacher has access via that assignment even if another assignment
    // is explicitly OFF; only block outright if every assignment is OFF.
    const db = getDb();
    const { data: assignments } = await db
      .from("teacher_classes")
      .select("class_id, section_id")
      .eq("teacher_id", userId);

    let firstBlocked: EffectiveAccessWithScope | null = null;
    let anyEnabled = false;
    for (const a of (assignments || []) as Array<{ class_id: number; section_id: number | null }>) {
      const scoped: AiScope = {
        ...baseScope,
        class_id: a.class_id,
        section_id: a.section_id ?? undefined,
      };
      const access = await getEffectiveAiAccess(scoped);
      if (access.enabled) {
        anyEnabled = true;
      } else if (!firstBlocked) {
        firstBlocked = { ...access, scope: scoped };
      }
    }

    if (anyEnabled || !(assignments || []).length) {
      return { enabled: true, scope: baseScope };
    }
    return firstBlocked || { enabled: false, blocked_at: "class", scope: baseScope };
  }

  return { enabled: false, blocked_at: "global" };
}

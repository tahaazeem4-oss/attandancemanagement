// supabase/functions/server/lib/aiScope.ts
// Resolves effective access and the tenant scope path for a given user.
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

const SCOPE_PRIORITY: Array<EffectiveAccess["blocked_at"]> = [
  "global",
  "organization",
  "campus",
  "class",
  "section",
  "student",
];

export interface EffectiveAccessWithScope extends EffectiveAccess {
  scope?: AiScope;
}

/** Load all relevant flag rows for the scope chain in one query. */
export async function getEffectiveAiAccess(scope: AiScope): Promise<EffectiveAccess> {
  const db = getDb();
  
  // Build scope type/id pairs to check
  const scopePairs: Array<{ type: string; id: number | null }> = [
    { type: "global", id: null },
  ];
  if (scope.organization_id) scopePairs.push({ type: "organization", id: scope.organization_id });
  if (scope.campus_id)        scopePairs.push({ type: "campus",       id: scope.campus_id });
  if (scope.class_id)         scopePairs.push({ type: "class",        id: scope.class_id });
  if (scope.section_id)       scopePairs.push({ type: "section",      id: scope.section_id });
  if (scope.student_id)       scopePairs.push({ type: "student",      id: scope.student_id });

  console.log("[aiScope] getEffectiveAiAccess called", {
    role: scope.role,
    user_id: scope.user_id,
    scope_pairs: JSON.stringify(scopePairs),
  });

  // Build OR filter for all (scope_type, scope_id) pairs to fetch only relevant flags
  const conditions = scopePairs
    .map(pair => {
      if (pair.type === "global") {
        return `and(scope_type.eq.global,scope_id.is.null)`;
      } else {
        return `and(scope_type.eq.${pair.type},scope_id.eq.${pair.id})`;
      }
    })
    .join(",");

  const { data, error } = await db
    .from("ai_feature_flags")
    .select("scope_type, scope_id, is_enabled, updated_at")
    .order("updated_at", { ascending: true })
    .or(conditions);

  if (error) {
    console.error("[aiScope] flag lookup FAILED", { error, conditions });
    return { enabled: false, blocked_at: "global" };
  }

  console.log("[aiScope] flag query returned", {
    rows_count: (data || []).length,
    rows: JSON.stringify(data),
  });

  // Build map of (scope_type, scope_id) -> is_enabled
  const flagMap = new Map<string, boolean>();
  for (const row of (data || []) as Array<{ scope_type: string; scope_id: number | null; is_enabled: boolean }>) {
    const key = `${row.scope_type}:${row.scope_id ?? "null"}`;
    flagMap.set(key, row.is_enabled);
  }

  // Check each scope level in priority order
  for (const pair of scopePairs) {
    const key = `${pair.type}:${pair.id ?? "null"}`;
    const flagValue = flagMap.get(key);
    
    console.log(`[aiScope] checking scope ${pair.type}:${pair.id ?? "null"}`, { found: flagMap.has(key), value: flagValue });
    
    if (flagMap.has(key) && flagValue === false) {
      console.log("[aiScope] access BLOCKED at scope", pair.type);
      return { enabled: false, blocked_at: pair.type as EffectiveAccess["blocked_at"] };
    }
  }
  
  // No explicit false found, so access enabled
  console.log("[aiScope] access ENABLED (no explicit false found)");
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

  console.log("[aiScope] resolveStudentScope for student", studentId, { data, error });

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

  console.log("[aiScope] resolveStudentScope resolved to", {
    student_id: row.id,
    organization_id: resolvedOrgId,
    campus_id: resolvedCampusId,
    class_id: row.class_id,
    section_id: row.section_id,
  });

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
  
  console.log("[aiScope] resolveAdminScope for admin", adminId, { admin });
  if (!admin?.school_id) {
    console.log("[aiScope] resolveAdminScope FAILED: no admin or school_id");
    return null;
  }

  const { data: school } = await db
    .from("schools")
    .select("id, org_id")
    .eq("id", admin.school_id)
    .maybeSingle();

  console.log("[aiScope] resolveAdminScope resolved to", { school_id: admin.school_id, org_id: school?.org_id });

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
  
  console.log("[aiScope] resolveOrgAdminScope for org_admin", orgAdminId, { oa });
  if (!oa?.org_id) {
    console.log("[aiScope] resolveOrgAdminScope FAILED: no org_admin or org_id");
    return null;
  }
  
  console.log("[aiScope] resolveOrgAdminScope resolved to", { org_id: oa.org_id });
  return {
    role: "org_admin",
    user_id: oa.id,
    organization_id: oa.org_id,
  };
}

async function resolveTeacherBaseScope(teacherId: number): Promise<AiScope | null> {
  const db = getDb();
  const { data: teacher } = await db
    .from("teachers")
    .select("id, school_id")
    .eq("id", teacherId)
    .maybeSingle();
  
  console.log("[aiScope] resolveTeacherBaseScope for teacher", teacherId, { teacher });
  if (!teacher?.school_id) {
    console.log("[aiScope] resolveTeacherBaseScope FAILED: no teacher or school_id");
    return null;
  }

  const { data: school } = await db
    .from("schools")
    .select("id, org_id")
    .eq("id", teacher.school_id)
    .maybeSingle();

  console.log("[aiScope] resolveTeacherBaseScope resolved to", { school_id: teacher.school_id, org_id: school?.org_id });

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

  console.log("[aiScope] getEffectiveAiAccessForUser called", { role, userId });

  if (role === "super_admin") {
    const scope: AiScope = { role: "super_admin", user_id: userId };
    const access = await getEffectiveAiAccess(scope);
    console.log("[aiScope] super_admin access resolved", { enabled: access.enabled, blocked_at: access.blocked_at });
    return { ...access, scope };
  }

  if (role === "org_admin") {
    const scope = await resolveOrgAdminScope(userId);
    if (!scope) {
      console.log("[aiScope] org_admin scope resolution FAILED");
      return { enabled: false, blocked_at: "organization" };
    }
    const access = await getEffectiveAiAccess(scope);
    console.log("[aiScope] org_admin access resolved", { enabled: access.enabled, blocked_at: access.blocked_at });
    return { ...access, scope };
  }

  if (role === "admin") {
    const scope = await resolveAdminScope(userId);
    if (!scope) {
      console.log("[aiScope] admin scope resolution FAILED");
      return { enabled: false, blocked_at: "campus" };
    }
    const access = await getEffectiveAiAccess(scope);
    console.log("[aiScope] admin access resolved", { enabled: access.enabled, blocked_at: access.blocked_at });
    return { ...access, scope };
  }

  if (role === "teacher") {
    const baseScope = await resolveTeacherBaseScope(userId);
    if (!baseScope) {
      console.log("[aiScope] teacher scope resolution FAILED");
      return { enabled: false, blocked_at: "campus" };
    }

    // Base chain check: global -> org -> campus.
    const baseAccess = await getEffectiveAiAccess(baseScope);
    console.log("[aiScope] teacher baseAccess", { enabled: baseAccess.enabled, blocked_at: baseAccess.blocked_at });
    if (!baseAccess.enabled) return { ...baseAccess, scope: baseScope };

    // Class/section overrides: if any mapped assignment is OFF, teacher loses AI access.
    const db = getDb();
    const { data: assignments } = await db
      .from("teacher_classes")
      .select("class_id, section_id")
      .eq("teacher_id", userId);

    console.log("[aiScope] teacher assignments found", { count: (assignments || []).length, assignments });

    let firstBlocked: EffectiveAccessWithScope | null = null;
    let anyEnabled = false;
    for (const a of (assignments || []) as Array<{ class_id: number; section_id: number | null }>) {
      const scoped: AiScope = {
        ...baseScope,
        class_id: a.class_id,
        section_id: a.section_id ?? undefined,
      };
      const access = await getEffectiveAiAccess(scoped);
      console.log("[aiScope] teacher assignment access", { class_id: a.class_id, section_id: a.section_id, enabled: access.enabled, blocked_at: access.blocked_at });
      if (access.enabled) {
        anyEnabled = true;
      } else if (!firstBlocked) {
        firstBlocked = { ...access, scope: scoped };
      }
    }

    if (anyEnabled || !(assignments || []).length) {
      console.log("[aiScope] teacher ENABLED (anyEnabled or no assignments)");
      return { enabled: true, scope: baseScope };
    }
    console.log("[aiScope] teacher BLOCKED (all assignments disabled)");
    return firstBlocked || { enabled: false, blocked_at: "class", scope: baseScope };
  }

  console.log("[aiScope] unknown role or not handled");
  return { enabled: false, blocked_at: "global" };
}

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

/** Load all relevant flag rows for the scope chain in one query. */
export async function getEffectiveAiAccess(scope: AiScope): Promise<EffectiveAccess> {
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

  const { data, error } = await db
    .from("ai_feature_flags")
    .select("scope_type, scope_id, is_enabled")
    .or(orExpr);

  if (error) {
    console.error("[aiScope] flag lookup failed", error);
    return { enabled: false, blocked_at: "global" };
  }

  // default true; explicit false at any level blocks.
  const byType = new Map<string, boolean>();
  for (const row of (data || []) as Array<{ scope_type: string; is_enabled: boolean }>) {
    byType.set(row.scope_type, row.is_enabled);
  }

  for (const level of SCOPE_PRIORITY) {
    if (byType.has(level) && byType.get(level) === false) {
      return { enabled: false, blocked_at: level };
    }
  }
  // global default true if no row
  return { enabled: true };
}

/** Resolve a student's full scope chain. */
export async function resolveStudentScope(studentId: number): Promise<AiScope | null> {
  const db = getDb();
  const { data, error } = await db
    .from("students")
    .select(`
      id, school_id, class_id, section_id,
      classes:class_id(class_name),
      sections:section_id(section_name),
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
    classes?: { class_name?: string } | null;
    sections?: { section_name?: string } | null;
    schools?: { org_id?: number } | null;
  };

  return {
    role: "student",
    user_id: row.id,
    student_id: row.id,
    organization_id: row.schools?.org_id,
    campus_id: row.school_id,
    class_id: row.class_id,
    section_id: row.section_id,
    class_name: row.classes?.class_name,
    section_name: row.sections?.section_name,
  };
}

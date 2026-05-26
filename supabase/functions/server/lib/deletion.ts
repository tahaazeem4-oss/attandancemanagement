import { getDb } from "../_shared.ts";

type DbClient = ReturnType<typeof getDb>;

type ImpactCounts = Record<string, number>;

export interface DeleteImpact {
  entity: "teacher" | "class" | "subject" | "school";
  id: number;
  name: string | null;
  mode_allowed: "archive" | "archive_or_reassign" | "migrate_then_archive";
  hard_delete_allowed: false;
  blocking_reasons: string[];
  counts: ImpactCounts;
}

async function countExact(query: Promise<{ count: number | null; error?: unknown }>): Promise<number> {
  const result = await query;
  return Number(result.count || 0);
}

function nowIso() {
  return new Date().toISOString();
}

export async function getTeacherDeleteImpact(db: DbClient, teacherId: number): Promise<DeleteImpact | null> {
  const { data: teacher } = await db
    .from("teachers")
    .select("id, first_name, last_name, teacher_role, school_id, is_active")
    .eq("id", teacherId)
    .maybeSingle();

  if (!teacher) return null;

  const counts = {
    teacher_assignments: await countExact(
      db.from("teacher_classes").select("*", { count: "exact", head: true }).eq("teacher_id", teacherId),
    ),
    teacher_attendance: await countExact(
      db.from("teacher_attendance").select("*", { count: "exact", head: true }).eq("teacher_id", teacherId),
    ),
    student_attendance_marked: await countExact(
      db.from("student_attendance").select("*", { count: "exact", head: true }).eq("teacher_id", teacherId),
    ),
    lectures_uploaded: await countExact(
      db.from("lectures").select("*", { count: "exact", head: true }).eq("teacher_id", teacherId),
    ),
    chat_conversations: await countExact(
      db.from("chat_conversations").select("*", { count: "exact", head: true }).eq("participant_type", "teacher").eq("participant_id", teacherId),
    ),
  };

  const blocking_reasons: string[] = [];
  if (counts.teacher_assignments > 0) {
    blocking_reasons.push(
      teacher.teacher_role === "class_teacher"
        ? "Teacher is currently assigned as a class teacher. Reassign the class before deletion."
        : "Teacher still has active class or section assignments. Reassign or remove assignments first.",
    );
  }

  return {
    entity: "teacher",
    id: teacherId,
    name: `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim() || null,
    mode_allowed: counts.teacher_assignments > 0 ? "archive_or_reassign" : "archive",
    hard_delete_allowed: false,
    blocking_reasons,
    counts,
  };
}

export async function archiveTeacher(
  db: DbClient,
  teacherId: number,
  archivedById: number,
  archivedByRole: string,
  replacementTeacherId?: number | null,
): Promise<{ archived: true; reassigned: boolean; impact: DeleteImpact }> {
  const impact = await getTeacherDeleteImpact(db, teacherId);
  if (!impact) throw new Error("Teacher not found");

  let reassigned = false;
  if (impact.counts.teacher_assignments > 0) {
    if (!replacementTeacherId) throw new Error("Teacher assignments must be reassigned before archiving");
    if (replacementTeacherId === teacherId) throw new Error("Replacement teacher must be different");

    const { data: replacement } = await db
      .from("teachers")
      .select("id, school_id, is_active")
      .eq("id", replacementTeacherId)
      .eq("is_active", true)
      .maybeSingle();

    if (!replacement) throw new Error("Replacement teacher not found or inactive");

    const { data: currentTeacher } = await db
      .from("teachers")
      .select("school_id")
      .eq("id", teacherId)
      .single();

    if (Number(replacement.school_id) !== Number(currentTeacher.school_id)) {
      throw new Error("Replacement teacher must belong to the same school");
    }

    const { data: assignments } = await db
      .from("teacher_classes")
      .select("class_id, section_id")
      .eq("teacher_id", teacherId);

    if ((assignments || []).length) {
      const reassignedRows = (assignments || []).map((assignment: Record<string, unknown>) => ({
        teacher_id: replacementTeacherId,
        class_id: assignment.class_id,
        section_id: assignment.section_id,
      }));

      await db.from("teacher_classes").upsert(reassignedRows, { onConflict: "teacher_id,class_id,section_id" });
      await db.from("teacher_classes").delete().eq("teacher_id", teacherId);
      reassigned = true;
    }
  }

  await db.from("teachers").update({
    is_active: false,
    archived_at: nowIso(),
    archived_by_id: archivedById,
    archived_by_role: archivedByRole,
    archived_reason: reassigned ? "Archived after reassignment" : "Archived by delete workflow",
  }).eq("id", teacherId);

  return { archived: true, reassigned, impact };
}

export async function getClassDeleteImpact(db: DbClient, classId: number): Promise<DeleteImpact | null> {
  const { data: cls } = await db
    .from("classes")
    .select("id, class_name, school_id, is_active")
    .eq("id", classId)
    .maybeSingle();
  if (!cls) return null;

  const studentIdsResult = await db.from("students").select("id").eq("class_id", classId);
  const studentIds = (studentIdsResult.data || []).map((row: Record<string, unknown>) => Number(row.id)).filter(Boolean);

  const counts = {
    sections: await countExact(db.from("sections").select("*", { count: "exact", head: true }).eq("class_id", classId).eq("is_active", true)),
    students: studentIds.length,
    teacher_assignments: await countExact(db.from("teacher_classes").select("*", { count: "exact", head: true }).eq("class_id", classId)),
    lectures: await countExact(db.from("lectures").select("*", { count: "exact", head: true }).eq("class_id", classId)),
    notifications: await countExact(db.from("notifications").select("*", { count: "exact", head: true }).eq("class_id", classId)),
    leave_applications: studentIds.length
      ? await countExact(db.from("leave_applications").select("*", { count: "exact", head: true }).in("student_id", studentIds))
      : 0,
    ai_documents: await countExact(db.from("ai_documents").select("*", { count: "exact", head: true }).eq("class_id", classId)),
  };

  const blocking_reasons: string[] = [];
  if (counts.students > 0) blocking_reasons.push("Class still has enrolled students. Move or archive students before deleting the class.");

  return {
    entity: "class",
    id: classId,
    name: String(cls.class_name || ""),
    mode_allowed: counts.students > 0 ? "migrate_then_archive" : "archive",
    hard_delete_allowed: false,
    blocking_reasons,
    counts,
  };
}

export async function archiveClass(
  db: DbClient,
  classId: number,
  archivedById: number,
  archivedByRole: string,
): Promise<{ archived: true; impact: DeleteImpact }> {
  const impact = await getClassDeleteImpact(db, classId);
  if (!impact) throw new Error("Class not found");
  if (impact.counts.students > 0) throw new Error("Students must be moved before archiving a class");

  await db.from("teacher_classes").delete().eq("class_id", classId);
  await db.from("sections").update({
    is_active: false,
    archived_at: nowIso(),
    archived_by_id: archivedById,
    archived_by_role: archivedByRole,
    archived_reason: "Parent class archived",
  }).eq("class_id", classId);

  await db.from("classes").update({
    is_active: false,
    archived_at: nowIso(),
    archived_by_id: archivedById,
    archived_by_role: archivedByRole,
    archived_reason: "Archived by delete workflow",
  }).eq("id", classId);

  return { archived: true, impact };
}

export async function getSubjectDeleteImpact(db: DbClient, subjectId: number): Promise<DeleteImpact | null> {
  const { data: subject } = await db
    .from("subjects")
    .select("id, name, school_id, is_active")
    .eq("id", subjectId)
    .maybeSingle();
  if (!subject) return null;

  const counts = {
    lectures_by_name: await countExact(
      db.from("lectures").select("*", { count: "exact", head: true }).eq("school_id", subject.school_id).eq("subject_name", subject.name),
    ),
    ai_documents: await countExact(
      db.from("ai_documents").select("*", { count: "exact", head: true }).eq("subject_id", subjectId),
    ),
    ai_chat_sessions: await countExact(
      db.from("ai_chat_sessions").select("*", { count: "exact", head: true }).eq("subject_id", subjectId),
    ),
    ai_usage_logs: await countExact(
      db.from("ai_usage_logs").select("*", { count: "exact", head: true }).eq("subject_id", subjectId),
    ),
  };

  const blocking_reasons: string[] = [];
  if (counts.ai_documents > 0) blocking_reasons.push("Subject is used by AI tutor materials. Archive it instead of deleting.");
  if (counts.lectures_by_name > 0) blocking_reasons.push("Subject name appears in existing lectures. Archive it to preserve history.");

  return {
    entity: "subject",
    id: subjectId,
    name: String(subject.name || ""),
    mode_allowed: "archive",
    hard_delete_allowed: false,
    blocking_reasons,
    counts,
  };
}

export async function archiveSubject(
  db: DbClient,
  subjectId: number,
  archivedById: number,
  archivedByRole: string,
): Promise<{ archived: true; impact: DeleteImpact }> {
  const impact = await getSubjectDeleteImpact(db, subjectId);
  if (!impact) throw new Error("Subject not found");

  await db.from("subjects").update({
    is_active: false,
    archived_at: nowIso(),
    archived_by_id: archivedById,
    archived_by_role: archivedByRole,
    archived_reason: "Archived by delete workflow",
  }).eq("id", subjectId);

  return { archived: true, impact };
}

export async function getSchoolDeleteImpact(db: DbClient, schoolId: number): Promise<DeleteImpact | null> {
  const { data: school } = await db
    .from("schools")
    .select("id, name, is_active")
    .eq("id", schoolId)
    .maybeSingle();
  if (!school) return null;

  const counts = {
    admins: await countExact(db.from("admins").select("*", { count: "exact", head: true }).eq("school_id", schoolId)),
    teachers: await countExact(db.from("teachers").select("*", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_active", true)),
    students: await countExact(db.from("students").select("*", { count: "exact", head: true }).eq("school_id", schoolId)),
    classes: await countExact(db.from("classes").select("*", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_active", true)),
    subjects: await countExact(db.from("subjects").select("*", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_active", true)),
    lectures: await countExact(db.from("lectures").select("*", { count: "exact", head: true }).eq("school_id", schoolId)),
    notifications: await countExact(db.from("notifications").select("*", { count: "exact", head: true }).eq("school_id", schoolId)),
    parent_access: await countExact(db.from("parent_school_access").select("*", { count: "exact", head: true }).eq("school_id", schoolId)),
    chat_conversations: await countExact(db.from("chat_conversations").select("*", { count: "exact", head: true }).eq("school_id", schoolId)),
    ai_documents: await countExact(db.from("ai_documents").select("*", { count: "exact", head: true }).eq("campus_id", schoolId)),
  };

  const blocking_reasons: string[] = [];
  if (Object.values(counts).some((value) => value > 0)) {
    blocking_reasons.push("Campus still owns operational or historical records. It will be archived instead of hard-deleted.");
  }

  return {
    entity: "school",
    id: schoolId,
    name: String(school.name || ""),
    mode_allowed: "archive",
    hard_delete_allowed: false,
    blocking_reasons,
    counts,
  };
}

export async function archiveSchool(
  db: DbClient,
  schoolId: number,
  archivedById: number,
  archivedByRole: string,
): Promise<{ archived: true; impact: DeleteImpact }> {
  const impact = await getSchoolDeleteImpact(db, schoolId);
  if (!impact) throw new Error("School not found");

  const archiveFields = {
    is_active: false,
    archived_at: nowIso(),
    archived_by_id: archivedById,
    archived_by_role: archivedByRole,
    archived_reason: "Archived by delete workflow",
  };

  await db.from("schools").update(archiveFields).eq("id", schoolId);
  await db.from("teachers").update(archiveFields).eq("school_id", schoolId);
  await db.from("classes").update(archiveFields).eq("school_id", schoolId);
  const { data: classRows } = await db.from("classes").select("id").eq("school_id", schoolId);
  const classIds = (classRows || []).map((row: Record<string, unknown>) => Number(row.id)).filter(Boolean);
  if (classIds.length) {
    await db.from("sections").update(archiveFields).in("class_id", classIds);
  }
  await db.from("subjects").update(archiveFields).eq("school_id", schoolId);

  return { archived: true, impact };
}

// ── Restore (unarchive) helpers ──────────────────────────────────────────────

const restoreFields = {
  is_active: true,
  archived_at: null,
  archived_by_id: null,
  archived_by_role: null,
  archived_reason: null,
};

export async function unarchiveTeacher(db: DbClient, teacherId: number): Promise<{ restored: true }> {
  const { data: teacher } = await db.from("teachers").select("id").eq("id", teacherId).maybeSingle();
  if (!teacher) throw new Error("Teacher not found");
  await db.from("teachers").update(restoreFields).eq("id", teacherId);
  return { restored: true };
}

export async function unarchiveClass(db: DbClient, classId: number): Promise<{ restored: true }> {
  const { data: cls } = await db.from("classes").select("id").eq("id", classId).maybeSingle();
  if (!cls) throw new Error("Class not found");
  await db.from("classes").update(restoreFields).eq("id", classId);
  await db.from("sections").update(restoreFields).eq("class_id", classId);
  return { restored: true };
}

export async function unarchiveSubject(db: DbClient, subjectId: number): Promise<{ restored: true }> {
  const { data: subject } = await db.from("subjects").select("id").eq("id", subjectId).maybeSingle();
  if (!subject) throw new Error("Subject not found");
  await db.from("subjects").update(restoreFields).eq("id", subjectId);
  return { restored: true };
}

export async function unarchiveSchool(db: DbClient, schoolId: number): Promise<{ restored: true }> {
  const { data: school } = await db.from("schools").select("id").eq("id", schoolId).maybeSingle();
  if (!school) throw new Error("School not found");
  await db.from("schools").update(restoreFields).eq("id", schoolId);
  await db.from("teachers").update(restoreFields).eq("school_id", schoolId);
  await db.from("classes").update(restoreFields).eq("school_id", schoolId);
  const { data: classRows } = await db.from("classes").select("id").eq("school_id", schoolId);
  const classIds = (classRows || []).map((row: Record<string, unknown>) => Number(row.id)).filter(Boolean);
  if (classIds.length) {
    await db.from("sections").update(restoreFields).in("class_id", classIds);
  }
  await db.from("subjects").update(restoreFields).eq("school_id", schoolId);
  return { restored: true };
}
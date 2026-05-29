import { getDb, json, resolveTeacherRole, verifyToken } from "../_shared.ts";

const VALID_DAY_KEYS = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

const VALID_SLOT_TYPES = new Set([
  "instruction",
  "break",
  "assembly",
  "free_period",
  "other",
]);

type TimetableRow = Record<string, unknown>;

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDayKey(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function ensureTimeValue(value: unknown): string | null {
  const text = String(value || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(text) ? text.slice(0, 5) : null;
}

function compareTimes(left: string, right: string): number {
  return left.localeCompare(right);
}

async function getOrgCampusIds(db: ReturnType<typeof getDb>, orgId: number): Promise<number[]> {
  const { data } = await db.from("schools").select("id").eq("org_id", orgId).eq("is_active", true);
  return (data || []).map((row: TimetableRow) => Number(row.id)).filter(Boolean);
}

async function getTeacherAssignments(db: ReturnType<typeof getDb>, teacherId: number): Promise<TimetableRow[]> {
  const { data } = await db
    .from("teacher_classes")
    .select(
      `class_id, section_id,
       classes!inner(id, class_name, school_id),
       sections!inner(id, section_name)`,
    )
    .eq("teacher_id", teacherId);

  return (data || []).map((row: TimetableRow) => ({
    class_id: row.class_id,
    section_id: row.section_id,
    school_id: (row.classes as TimetableRow)?.school_id,
    class_name: (row.classes as TimetableRow)?.class_name,
    section_name: (row.sections as TimetableRow)?.section_name,
  }));
}

async function resolveSchoolScope(
  db: ReturnType<typeof getDb>,
  user: TimetableRow,
  requestedSchoolId: unknown,
): Promise<{ schoolId: number | null; error?: Response }> {
  const requested = toNumber(requestedSchoolId);

  if (user.role === "admin") {
    const schoolId = toNumber(user.school_id);
    if (!schoolId) return { schoolId: null, error: json({ message: "Invalid school scope" }, 403) };
    return { schoolId };
  }

  if (user.role === "org_admin") {
    const orgId = toNumber(user.org_id);
    if (!orgId) return { schoolId: null, error: json({ message: "Invalid organization scope" }, 403) };
    const campusIds = await getOrgCampusIds(db, orgId);
    if (!campusIds.length) return { schoolId: null, error: json({ message: "No campuses available" }, 404) };
    const schoolId = requested || campusIds[0];
    if (!campusIds.includes(schoolId)) {
      return { schoolId: null, error: json({ message: "Campus out of scope" }, 403) };
    }
    return { schoolId };
  }

  const schoolId = toNumber(user.school_id);
  if (!schoolId) return { schoolId: null, error: json({ message: "Invalid school scope" }, 403) };
  return { schoolId };
}

async function getStructure(db: ReturnType<typeof getDb>, schoolId: number) {
  const [{ data: days }, { data: slots }] = await Promise.all([
    db.from("school_timetable_days").select("id, day_key, day_label, display_order, is_active").eq("school_id", schoolId).order("display_order"),
    db.from("school_timetable_slots").select("id, slot_name, start_time, end_time, slot_type, display_order, is_active, day_keys").eq("school_id", schoolId).order("display_order"),
  ]);

  return {
    days: days || [],
    slots: (slots || []).map((slot: TimetableRow) => ({
      ...slot,
      start_time: String(slot.start_time || "").slice(0, 5),
      end_time: String(slot.end_time || "").slice(0, 5),
      day_keys: Array.isArray(slot.day_keys) ? slot.day_keys : null,
    })),
  };
}

async function getClassesForSchool(db: ReturnType<typeof getDb>, schoolId: number) {
  const { data } = await db
    .from("classes")
    .select("id, class_name, school_id, sections(id, section_name)")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .order("class_name");
  return data || [];
}

async function getSubjectsForSchool(db: ReturnType<typeof getDb>, schoolId: number) {
  const { data } = await db
    .from("subjects")
    .select("id, name")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .order("name");
  return data || [];
}

async function getTeachersForSchool(db: ReturnType<typeof getDb>, schoolId: number) {
  const { data: teachers } = await db
    .from("teachers")
    .select("id, first_name, last_name, teacher_role")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .order("last_name");

  const teacherRows = teachers || [];
  const teacherIds = teacherRows.map((row: TimetableRow) => Number(row.id)).filter(Boolean);

  const [assignmentRows, subjectRows] = await Promise.all([
    teacherIds.length
      ? db.from("teacher_classes").select("teacher_id, class_id, section_id").in("teacher_id", teacherIds)
      : Promise.resolve({ data: [] as TimetableRow[] }),
    teacherIds.length
      ? db.from("teacher_subject_assignments").select("teacher_id, subject_id").eq("school_id", schoolId).in("teacher_id", teacherIds)
      : Promise.resolve({ data: [] as TimetableRow[] }),
  ]);

  const byTeacher: Record<number, TimetableRow[]> = {};
  for (const assignment of assignmentRows.data || []) {
    const teacherId = Number((assignment as TimetableRow).teacher_id);
    if (!byTeacher[teacherId]) byTeacher[teacherId] = [];
    byTeacher[teacherId].push({
      class_id: (assignment as TimetableRow).class_id,
      section_id: (assignment as TimetableRow).section_id,
    });
  }

  const subjectsByTeacher: Record<number, number[]> = {};
  for (const row of subjectRows.data || []) {
    const teacherId = Number((row as TimetableRow).teacher_id);
    if (!subjectsByTeacher[teacherId]) subjectsByTeacher[teacherId] = [];
    subjectsByTeacher[teacherId].push(Number((row as TimetableRow).subject_id));
  }

  return teacherRows.map((teacher: TimetableRow) => ({
    ...teacher,
    full_name: [teacher.first_name, teacher.last_name].filter(Boolean).join(" "),
    assignments: byTeacher[Number(teacher.id)] || [],
    subject_ids: subjectsByTeacher[Number(teacher.id)] || [],
  }));
}

async function getEntryRows(
  db: ReturnType<typeof getDb>,
  schoolId: number,
  classId: number,
  sectionId: number,
  versionStatus: string,
) {
  const { data } = await db
    .from("section_timetable_entries")
    .select(
      `id, day_key, slot_id, subject_id, teacher_id, note, version_status, updated_at,
       school_timetable_slots!inner(id, slot_name, start_time, end_time, slot_type, display_order, day_keys),
       subjects(id, name),
       teachers(id, first_name, last_name)`,
    )
    .eq("school_id", schoolId)
    .eq("class_id", classId)
    .eq("section_id", sectionId)
    .eq("version_status", versionStatus)
    .order("day_key")
    .order("slot_id");

  return (data || []).map((row: TimetableRow) => ({
    id: row.id,
    day_key: row.day_key,
    slot_id: row.slot_id,
    subject_id: row.subject_id,
    subject_name: (row.subjects as TimetableRow | null)?.name || null,
    teacher_id: row.teacher_id,
    teacher_name: row.teachers ? [
      (row.teachers as TimetableRow).first_name,
      (row.teachers as TimetableRow).last_name,
    ].filter(Boolean).join(" ") : null,
    note: row.note,
    version_status: row.version_status,
    updated_at: row.updated_at,
    slot: {
      ...(row.school_timetable_slots as TimetableRow),
      start_time: String((row.school_timetable_slots as TimetableRow)?.start_time || "").slice(0, 5),
      end_time: String((row.school_timetable_slots as TimetableRow)?.end_time || "").slice(0, 5),
      day_keys: Array.isArray((row.school_timetable_slots as TimetableRow)?.day_keys)
        ? ((row.school_timetable_slots as TimetableRow).day_keys as string[])
        : null,
    },
  }));
}

async function assertClassSectionScope(
  db: ReturnType<typeof getDb>,
  schoolId: number,
  classId: number,
  sectionId: number,
) {
  const { data: classRow } = await db
    .from("classes")
    .select("id, class_name, school_id")
    .eq("id", classId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!classRow) return { error: json({ message: "Class not found" }, 404) };

  const { data: sectionRow } = await db
    .from("sections")
    .select("id, section_name, class_id")
    .eq("id", sectionId)
    .eq("class_id", classId)
    .maybeSingle();
  if (!sectionRow) return { error: json({ message: "Section not found" }, 404) };

  return { classRow, sectionRow };
}

export async function handleTimetable(
  req: Request,
  path: string,
  url: URL,
): Promise<Response> {
  const method = req.method;

  let user: TimetableRow;
  try {
    user = await verifyToken(req);
  } catch {
    return json({ message: "Unauthorized" }, 401);
  }

  const db = getDb();

  if (path === "/timetable/meta" && method === "GET") {
    const scope = await resolveSchoolScope(db, user, url.searchParams.get("school_id"));
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid school scope" }, 403);

    try {
      if (user.role === "teacher") {
        const teacherId = toNumber(user.id);
        if (!teacherId) return json({ message: "Invalid teacher scope" }, 403);
        const teacherRole = await resolveTeacherRole(db, teacherId);
        const [assignments, subjects, structure] = await Promise.all([
          getTeacherAssignments(db, teacherId),
          getSubjectsForSchool(db, scope.schoolId),
          getStructure(db, scope.schoolId),
        ]);
        return json({ school_id: scope.schoolId, teacher_role: teacherRole, assignments, subjects, ...structure });
      }

      const [classes, subjects, structure] = await Promise.all([
        getClassesForSchool(db, scope.schoolId),
        getSubjectsForSchool(db, scope.schoolId),
        getStructure(db, scope.schoolId),
      ]);

      if (user.role === "org_admin") {
        const orgId = toNumber(user.org_id);
        const campusIds = orgId ? await getOrgCampusIds(db, orgId) : [];
        const { data: campuses } = campusIds.length
          ? await db.from("schools").select("id, name").in("id", campusIds).order("name")
          : { data: [] as TimetableRow[] };
        const teachers = await getTeachersForSchool(db, scope.schoolId);
        return json({ school_id: scope.schoolId, campuses: campuses || [], classes, subjects, teachers, ...structure });
      }

      const teachers = await getTeachersForSchool(db, scope.schoolId);
      return json({ school_id: scope.schoolId, classes, subjects, teachers, ...structure });
    } catch (err) {
      console.error("[timetable/meta]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/timetable/structure" && method === "GET") {
    const scope = await resolveSchoolScope(db, user, url.searchParams.get("school_id"));
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid school scope" }, 403);

    try {
      return json({ school_id: scope.schoolId, ...(await getStructure(db, scope.schoolId)) });
    } catch (err) {
      console.error("[timetable/structure GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/timetable/structure" && method === "PUT") {
    if (user.role !== "admin" && user.role !== "org_admin") return json({ message: "Forbidden" }, 403);

    const body = await req.json().catch(() => null) as TimetableRow | null;
    const scope = await resolveSchoolScope(db, user, body?.school_id);
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid school scope" }, 403);

    const days = Array.isArray(body?.days) ? body?.days as TimetableRow[] : [];
    const slots = Array.isArray(body?.slots) ? body?.slots as TimetableRow[] : [];
    if (!days.length) return json({ message: "At least one working day is required" }, 400);
    if (!slots.length) return json({ message: "At least one slot is required" }, 400);

    const normalizedDays: TimetableRow[] = [];
    const seenDays = new Set<string>();
    for (const [index, row] of days.entries()) {
      const dayKey = normalizeDayKey(row.day_key);
      if (!VALID_DAY_KEYS.has(dayKey)) return json({ message: `Invalid day at row ${index + 1}` }, 400);
      if (seenDays.has(dayKey)) return json({ message: `Duplicate day ${dayKey}` }, 400);
      seenDays.add(dayKey);
      normalizedDays.push({
        day_key: dayKey,
        day_label: String(row.day_label || dayKey[0].toUpperCase() + dayKey.slice(1)).trim(),
        display_order: index + 1,
        is_active: row.is_active !== false,
      });
    }

    const normalizedSlots: TimetableRow[] = [];
    for (const [index, row] of slots.entries()) {
      const slotName = String(row.slot_name || `Slot ${index + 1}`).trim();
      const startTime = ensureTimeValue(row.start_time);
      const endTime = ensureTimeValue(row.end_time);
      const slotType = String(row.slot_type || "instruction").trim();
      if (!slotName) return json({ message: `Slot name is required at row ${index + 1}` }, 400);
      if (!startTime || !endTime) return json({ message: `Valid start and end time are required at row ${index + 1}` }, 400);
      if (compareTimes(startTime, endTime) >= 0) return json({ message: `Slot ${slotName} must end after it starts` }, 400);
      if (!VALID_SLOT_TYPES.has(slotType)) return json({ message: `Invalid slot type for ${slotName}` }, 400);

      const rawDayKeys = Array.isArray((row as TimetableRow).day_keys) ? ((row as TimetableRow).day_keys as unknown[]) : null;
      let dayKeys: string[] | null = null;
      if (rawDayKeys && rawDayKeys.length) {
        const cleaned: string[] = [];
        for (const dk of rawDayKeys) {
          const k = normalizeDayKey(dk as string);
          if (!VALID_DAY_KEYS.has(k)) return json({ message: `Invalid day key on slot ${slotName}` }, 400);
          if (!cleaned.includes(k)) cleaned.push(k);
        }
        dayKeys = cleaned;
      }

      normalizedSlots.push({
        slot_name: slotName,
        start_time: startTime,
        end_time: endTime,
        slot_type: slotType,
        display_order: index + 1,
        is_active: row.is_active !== false,
        day_keys: dayKeys,
      });
    }

    const lastStartByDay: Record<string, string> = {};
    for (const slot of normalizedSlots) {
      const days = (slot.day_keys && (slot.day_keys as string[]).length) ? (slot.day_keys as string[]) : ["__all__"];
      for (const dk of days) {
        const prev = lastStartByDay[dk];
        if (prev && compareTimes(prev, slot.start_time as string) > 0) {
          return json({ message: `Slots for ${dk === "__all__" ? "all days" : dk} must be in ascending order` }, 400);
        }
        lastStartByDay[dk] = slot.start_time as string;
      }
    }

    try {
      await db.from("school_timetable_days").delete().eq("school_id", scope.schoolId);
      await db.from("school_timetable_slots").delete().eq("school_id", scope.schoolId);

      await db.from("school_timetable_days").insert(normalizedDays.map((row) => ({ ...row, school_id: scope.schoolId })));
      await db.from("school_timetable_slots").insert(normalizedSlots.map((row) => ({ ...row, school_id: scope.schoolId })));

      return json({ message: "Timetable structure updated", school_id: scope.schoolId, ...(await getStructure(db, scope.schoolId)) });
    } catch (err) {
      console.error("[timetable/structure PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/timetable/section" && method === "GET") {
    const classId = toNumber(url.searchParams.get("class_id"));
    const sectionId = toNumber(url.searchParams.get("section_id"));
    const requestedStatus = String(url.searchParams.get("status") || "").trim().toLowerCase();
    if (!classId || !sectionId) return json({ message: "class_id and section_id are required" }, 400);

    const scope = await resolveSchoolScope(db, user, url.searchParams.get("school_id"));
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid school scope" }, 403);

    let versionStatus = requestedStatus === "draft" ? "draft" : "published";
    if (user.role === "admin" || user.role === "org_admin") {
      versionStatus = requestedStatus === "published" ? "published" : "draft";
    }

    if (user.role === "teacher") {
      const teacherId = toNumber(user.id);
      if (!teacherId) return json({ message: "Invalid teacher scope" }, 403);
      const assignments = await getTeacherAssignments(db, teacherId);
      const allowed = assignments.some((row) => Number(row.class_id) === classId && Number(row.section_id) === sectionId);
      if (!allowed) return json({ message: "Access denied" }, 403);
      const teacherRole = await resolveTeacherRole(db, teacherId);
      if (teacherRole !== "floor_incharge") versionStatus = "published";
    }

    try {
      const scopeCheck = await assertClassSectionScope(db, scope.schoolId, classId, sectionId);
      if (scopeCheck.error) return scopeCheck.error;

      const [structure, entries] = await Promise.all([
        getStructure(db, scope.schoolId),
        getEntryRows(db, scope.schoolId, classId, sectionId, versionStatus),
      ]);
      return json({
        school_id: scope.schoolId,
        class_id: classId,
        section_id: sectionId,
        class_name: (scopeCheck.classRow as TimetableRow).class_name,
        section_name: (scopeCheck.sectionRow as TimetableRow).section_name,
        version_status: versionStatus,
        ...structure,
        entries,
      });
    } catch (err) {
      console.error("[timetable/section GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/timetable/section" && method === "PUT") {
    if (user.role !== "admin" && user.role !== "org_admin" && user.role !== "teacher") {
      return json({ message: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => null) as TimetableRow | null;
    const classId = toNumber(body?.class_id);
    const sectionId = toNumber(body?.section_id);
    const entries = Array.isArray(body?.entries) ? body?.entries as TimetableRow[] : [];
    if (!classId || !sectionId) return json({ message: "class_id and section_id are required" }, 400);

    const scope = await resolveSchoolScope(db, user, body?.school_id);
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid school scope" }, 403);

    if (user.role === "teacher") {
      const teacherId = toNumber(user.id);
      if (!teacherId) return json({ message: "Invalid teacher scope" }, 403);
      const teacherRole = await resolveTeacherRole(db, teacherId);
      if (teacherRole !== "floor_incharge") return json({ message: "Only floor incharge can edit timetable" }, 403);
      const assignments = await getTeacherAssignments(db, teacherId);
      const allowed = assignments.some((row) => Number(row.class_id) === classId && Number(row.section_id) === sectionId);
      if (!allowed) return json({ message: "Access denied" }, 403);
    }

    try {
      const scopeCheck = await assertClassSectionScope(db, scope.schoolId, classId, sectionId);
      if (scopeCheck.error) return scopeCheck.error;

      const structure = await getStructure(db, scope.schoolId);
      const validDays = new Set((structure.days || []).filter((row: TimetableRow) => row.is_active !== false).map((row: TimetableRow) => String(row.day_key)));
      const slots = structure.slots || [];
      const slotMap = new Map(slots.map((row: TimetableRow) => [Number(row.id), row]));

      const subjectIds = Array.from(new Set(entries.map((entry) => toNumber(entry.subject_id)).filter(Boolean))) as number[];
      const teacherIds = Array.from(new Set(entries.map((entry) => toNumber(entry.teacher_id)).filter(Boolean))) as number[];

      const [{ data: subjects }, { data: teachers }] = await Promise.all([
        subjectIds.length ? db.from("subjects").select("id, school_id").in("id", subjectIds) : Promise.resolve({ data: [] as TimetableRow[] }),
        teacherIds.length ? db.from("teachers").select("id, school_id").in("id", teacherIds) : Promise.resolve({ data: [] as TimetableRow[] }),
      ]);

      const validSubjectIds = new Set((subjects || []).filter((row: TimetableRow) => Number(row.school_id) === scope.schoolId).map((row: TimetableRow) => Number(row.id)));
      const validTeacherIds = new Set((teachers || []).filter((row: TimetableRow) => Number(row.school_id) === scope.schoolId).map((row: TimetableRow) => Number(row.id)));

      const nextRows: TimetableRow[] = [];
      const daySlotSeen = new Set<string>();
      for (const entry of entries) {
        const dayKey = normalizeDayKey(entry.day_key);
        const slotId = toNumber(entry.slot_id);
        const subjectId = toNumber(entry.subject_id);
        const teacherId = toNumber(entry.teacher_id);
        const note = String(entry.note || "").trim() || null;
        if (!dayKey || !validDays.has(dayKey)) return json({ message: `Invalid day ${entry.day_key || ""}` }, 400);
        if (!slotId || !slotMap.has(slotId)) return json({ message: "Invalid slot selected" }, 400);
        const slot = slotMap.get(slotId) as TimetableRow;
        const slotDayKeys = Array.isArray((slot as TimetableRow).day_keys) ? ((slot as TimetableRow).day_keys as string[]) : null;
        if (slotDayKeys && slotDayKeys.length && !slotDayKeys.includes(dayKey)) {
          return json({ message: `Slot ${String(slot.slot_name || "")} is not scheduled on ${dayKey}` }, 400);
        }
        const key = `${dayKey}:${slotId}`;
        if (daySlotSeen.has(key)) return json({ message: "Each day and slot can only be filled once" }, 400);
        daySlotSeen.add(key);

        const slotType = String(slot.slot_type || "instruction");
        if (slotType === "instruction" && !subjectId) {
          return json({ message: `Subject is required for ${String(slot.slot_name || "selected slot")}` }, 400);
        }
        if (subjectId && !validSubjectIds.has(subjectId)) return json({ message: "Invalid subject selected" }, 400);
        if (teacherId && !validTeacherIds.has(teacherId)) return json({ message: "Invalid teacher selected" }, 400);

        nextRows.push({
          school_id: scope.schoolId,
          class_id: classId,
          section_id: sectionId,
          day_key: dayKey,
          slot_id: slotId,
          subject_id: subjectId,
          teacher_id: teacherId,
          note,
          version_status: "draft",
          updated_by_role: String(user.role || ""),
          updated_by_id: toNumber(user.id),
        });
      }

      if (teacherIds.length) {
        for (const teacherId of teacherIds) {
          const teacherRows = nextRows.filter((row) => Number(row.teacher_id) === teacherId);
          for (const row of teacherRows) {
            const { data: conflictingRows } = await db
              .from("section_timetable_entries")
              .select("class_id, section_id")
              .eq("school_id", scope.schoolId)
              .eq("teacher_id", teacherId)
              .eq("day_key", row.day_key as string)
              .eq("slot_id", row.slot_id as number)
              .eq("version_status", "draft");
            const hasConflict = (conflictingRows || []).some((conflict) => (
              Number((conflict as TimetableRow).class_id) !== classId
              || Number((conflict as TimetableRow).section_id) !== sectionId
            ));
            if (hasConflict) {
              return json({ message: "Teacher conflict detected for one or more slots" }, 409);
            }
          }
        }
      }

      await db
        .from("section_timetable_entries")
        .delete()
        .eq("school_id", scope.schoolId)
        .eq("class_id", classId)
        .eq("section_id", sectionId)
        .eq("version_status", "draft");

      if (nextRows.length) {
        await db.from("section_timetable_entries").insert(nextRows);
      }

      return json({ message: "Draft timetable updated", entries: await getEntryRows(db, scope.schoolId, classId, sectionId, "draft") });
    } catch (err) {
      console.error("[timetable/section PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/timetable/section/publish" && method === "POST") {
    if (user.role !== "admin" && user.role !== "org_admin") return json({ message: "Forbidden" }, 403);

    const body = await req.json().catch(() => null) as TimetableRow | null;
    const classId = toNumber(body?.class_id);
    const sectionId = toNumber(body?.section_id);
    if (!classId || !sectionId) return json({ message: "class_id and section_id are required" }, 400);

    const scope = await resolveSchoolScope(db, user, body?.school_id);
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid school scope" }, 403);

    try {
      const scopeCheck = await assertClassSectionScope(db, scope.schoolId, classId, sectionId);
      if (scopeCheck.error) return scopeCheck.error;

      const draftRows = await getEntryRows(db, scope.schoolId, classId, sectionId, "draft");

      await db
        .from("section_timetable_entries")
        .delete()
        .eq("school_id", scope.schoolId)
        .eq("class_id", classId)
        .eq("section_id", sectionId)
        .eq("version_status", "published");

      if (draftRows.length) {
        const sourceRows = await db
          .from("section_timetable_entries")
          .select("school_id, class_id, section_id, day_key, slot_id, subject_id, teacher_id, note")
          .eq("school_id", scope.schoolId)
          .eq("class_id", classId)
          .eq("section_id", sectionId)
          .eq("version_status", "draft");

        const publishRows = (sourceRows.data || []).map((row: TimetableRow) => ({
          ...row,
          version_status: "published",
          updated_by_role: String(user.role || ""),
          updated_by_id: toNumber(user.id),
        }));
        await db.from("section_timetable_entries").insert(publishRows);
      }

      return json({ message: "Timetable published", entries: await getEntryRows(db, scope.schoolId, classId, sectionId, "published") });
    } catch (err) {
      console.error("[timetable/section/publish]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/timetable/student" && method === "GET") {
    if (user.role !== "student") return json({ message: "Forbidden" }, 403);
    const schoolId = toNumber(user.school_id);
    const classId = toNumber(user.class_id);
    const sectionId = toNumber(user.section_id);
    if (!schoolId || !classId || !sectionId) return json({ message: "Student scope is incomplete" }, 400);

    try {
      const [structure, entries] = await Promise.all([
        getStructure(db, schoolId),
        getEntryRows(db, schoolId, classId, sectionId, "published"),
      ]);
      return json({ school_id: schoolId, class_id: classId, section_id: sectionId, version_status: "published", ...structure, entries });
    } catch (err) {
      console.error("[timetable/student]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const parentMatch = path.match(/^\/timetable\/parent\/(\d+)$/);
  if (parentMatch && method === "GET") {
    if (user.role !== "parent") return json({ message: "Forbidden" }, 403);
    const studentId = Number(parentMatch[1]);

    try {
      const { data: link } = await db
        .from("parent_student")
        .select("student_id")
        .eq("parent_id", Number(user.id))
        .eq("student_id", studentId)
        .maybeSingle();
      if (!link) return json({ message: "Access denied" }, 403);

      const { data: student } = await db
        .from("students")
        .select("school_id, class_id, section_id")
        .eq("id", studentId)
        .maybeSingle();
      if (!student) return json({ message: "Student not found" }, 404);

      const schoolId = Number((student as TimetableRow).school_id);
      const classId = Number((student as TimetableRow).class_id);
      const sectionId = Number((student as TimetableRow).section_id);

      const [structure, entries] = await Promise.all([
        getStructure(db, schoolId),
        getEntryRows(db, schoolId, classId, sectionId, "published"),
      ]);
      return json({ school_id: schoolId, class_id: classId, section_id: sectionId, version_status: "published", ...structure, entries });
    } catch (err) {
      console.error("[timetable/parent]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/timetable/teacher-subjects" && method === "PUT") {
    if (user.role !== "admin" && user.role !== "org_admin" && user.role !== "super_admin") {
      return json({ message: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => null) as TimetableRow | null;
    const teacherId = toNumber(body?.teacher_id);
    const subjectIds: number[] = Array.isArray(body?.subject_ids)
      ? (body?.subject_ids as unknown[]).map(toNumber).filter((v): v is number => v !== null)
      : [];
    if (!teacherId) return json({ message: "teacher_id is required" }, 400);

    const scope = await resolveSchoolScope(db, user, body?.school_id);
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid school scope" }, 403);

    try {
      const { data: teacherRow } = await db
        .from("teachers")
        .select("id, school_id")
        .eq("id", teacherId)
        .eq("school_id", scope.schoolId)
        .maybeSingle();
      if (!teacherRow) return json({ message: "Teacher not found in this school" }, 404);

      if (subjectIds.length) {
        const { data: subjects } = await db.from("subjects").select("id, school_id").in("id", subjectIds);
        const invalid = (subjects || []).filter((s: TimetableRow) => Number(s.school_id) !== scope.schoolId);
        if (invalid.length) return json({ message: "Invalid subject selected" }, 400);
      }

      await db.from("teacher_subject_assignments").delete().eq("teacher_id", teacherId);
      if (subjectIds.length) {
        await db.from("teacher_subject_assignments").insert(
          subjectIds.map((sid) => ({
            teacher_id: teacherId,
            subject_id: sid,
            school_id: scope.schoolId,
            assigned_by_role: String(user.role || ""),
            assigned_by_id: toNumber(user.id),
          })),
        );
      }

      return json({ message: "Teacher subjects updated", teacher_id: teacherId, subject_ids: subjectIds });
    } catch (err) {
      console.error("[timetable/teacher-subjects PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path.startsWith("/timetable/teacher-subjects/") && method === "GET") {
    if (user.role !== "admin" && user.role !== "org_admin" && user.role !== "super_admin") {
      return json({ message: "Forbidden" }, 403);
    }
    const teacherId = toNumber(path.split("/").pop());
    if (!teacherId) return json({ message: "teacher_id required" }, 400);
    try {
      const { data: teacherRow } = await db
        .from("teachers")
        .select("id, school_id")
        .eq("id", teacherId)
        .maybeSingle();
      if (!teacherRow) return json({ message: "Teacher not found" }, 404);
      const scope = await resolveSchoolScope(db, user, Number(teacherRow.school_id));
      if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid scope" }, 403);
      if (Number(teacherRow.school_id) !== scope.schoolId) return json({ message: "Forbidden" }, 403);
      const { data: rows } = await db
        .from("teacher_subject_assignments")
        .select("subject_id")
        .eq("teacher_id", teacherId);
      const subject_ids = (rows || []).map((r: TimetableRow) => Number(r.subject_id));
      return json({ teacher_id: teacherId, subject_ids });
    } catch (err) {
      console.error("[timetable/teacher-subjects GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/timetable/teacher-busy" && method === "GET") {
    if (user.role !== "admin" && user.role !== "org_admin" && user.role !== "super_admin" && user.role !== "teacher") {
      return json({ message: "Forbidden" }, 403);
    }
    const scope = await resolveSchoolScope(db, user, url.searchParams.get("school_id"));
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid scope" }, 403);
    const excludeClassId = toNumber(url.searchParams.get("exclude_class_id"));
    const excludeSectionId = toNumber(url.searchParams.get("exclude_section_id"));
    const statusParam = url.searchParams.get("status") || "draft";
    try {
      let q = db
        .from("section_timetable_entries")
        .select(`teacher_id, day_key, slot_id, class_id, section_id, version_status,
                 classes(id, class_name),
                 class_sections(id, section_name)`) 
        .eq("school_id", scope.schoolId)
        .eq("version_status", statusParam)
        .not("teacher_id", "is", null);
      const { data } = await q;
      const filtered = (data || []).filter((row: TimetableRow) => {
        if (!excludeClassId || !excludeSectionId) return true;
        return !(Number(row.class_id) === excludeClassId && Number(row.section_id) === excludeSectionId);
      });
      const byTeacher: Record<string, TimetableRow[]> = {};
      for (const row of filtered) {
        const tid = String(row.teacher_id);
        if (!byTeacher[tid]) byTeacher[tid] = [];
        byTeacher[tid].push({
          day_key: row.day_key,
          slot_id: row.slot_id,
          class_id: row.class_id,
          section_id: row.section_id,
          class_name: (row.classes as TimetableRow | null)?.class_name || null,
          section_name: (row.class_sections as TimetableRow | null)?.section_name || null,
        });
      }
      return json({ busy: byTeacher });
    } catch (err) {
      console.error("[timetable/teacher-busy GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/timetable/holidays" && method === "GET") {
    const scope = await resolveSchoolScope(db, user, url.searchParams.get("school_id"));
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid scope" }, 403);
    try {
      const { data } = await db
        .from("school_holidays")
        .select("id, holiday_date, label")
        .eq("school_id", scope.schoolId)
        .order("holiday_date");
      return json({ holidays: data || [] });
    } catch (err) {
      console.error("[timetable/holidays GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/timetable/holidays" && method === "POST") {
    if (user.role !== "admin" && user.role !== "org_admin") return json({ message: "Forbidden" }, 403);
    const body = await req.json().catch(() => null) as TimetableRow | null;
    const scope = await resolveSchoolScope(db, user, body?.school_id);
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid scope" }, 403);
    const holidayDate = String(body?.holiday_date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) return json({ message: "holiday_date must be YYYY-MM-DD" }, 400);
    const label = String(body?.label || "").trim() || null;
    try {
      const { data, error } = await db
        .from("school_holidays")
        .upsert({ school_id: scope.schoolId, holiday_date: holidayDate, label }, { onConflict: "school_id,holiday_date" })
        .select("id, holiday_date, label")
        .single();
      if (error) throw error;
      return json({ holiday: data });
    } catch (err) {
      console.error("[timetable/holidays POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path.startsWith("/timetable/holidays/") && method === "DELETE") {
    if (user.role !== "admin" && user.role !== "org_admin") return json({ message: "Forbidden" }, 403);
    const holidayId = toNumber(path.split("/").pop());
    if (!holidayId) return json({ message: "Invalid holiday id" }, 400);
    const scope = await resolveSchoolScope(db, user, url.searchParams.get("school_id"));
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid scope" }, 403);
    try {
      await db.from("school_holidays").delete().eq("id", holidayId).eq("school_id", scope.schoolId);
      return json({ message: "Deleted" });
    } catch (err) {
      console.error("[timetable/holidays DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}
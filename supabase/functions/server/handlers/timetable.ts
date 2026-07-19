import { getDb, json, verifyToken } from "../_shared.ts";

const VALID_DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
const VALID_DAY_KEY_SET = new Set<string>(VALID_DAY_KEYS);

type Row = Record<string, unknown>;
type Db = ReturnType<typeof getDb>;

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

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart;
}

async function getOrgCampusIds(db: Db, orgId: number): Promise<number[]> {
  const { data } = await db.from("schools").select("id").eq("org_id", orgId).eq("is_active", true);
  return (data || []).map((row: Row) => Number(row.id)).filter(Boolean);
}

async function resolveSchoolScope(
  db: Db,
  user: Row,
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

async function assertClassSectionScope(db: Db, schoolId: number, classId: number, sectionId: number) {
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

function decoratePeriod(row: Row): Row {
  return {
    id: row.id,
    day_key: row.day_key,
    schedule_type: row.schedule_type,
    period_order: row.period_order,
    subject_id: row.subject_id,
    subject_name: (row.subjects as Row | null)?.name || null,
    teacher_id: row.teacher_id,
    teacher_name: row.teachers
      ? [(row.teachers as Row).first_name, (row.teachers as Row).last_name].filter(Boolean).join(" ")
      : null,
    start_time: String(row.start_time || "").slice(0, 5),
    end_time: String(row.end_time || "").slice(0, 5),
    updated_at: row.updated_at,
  };
}

const PERIOD_SELECT = `id, class_id, section_id, day_key, schedule_type, period_order, subject_id, teacher_id,
   start_time, end_time, updated_at,
   subjects(id, name),
   teachers(id, first_name, last_name)`;

// Full week for one class/section: default rows for every day, plus a
// separate friday_override list (empty when the school hasn't customized
// Friday). The caller decides whether to display the override or fall back
// to the normal Friday row — kept explicit here rather than pre-merged so
// the editor UI can show "this class has a Friday override" state.
async function getClassWeek(db: Db, schoolId: number, classId: number, sectionId: number) {
  const { data } = await db
    .from("timetable_periods")
    .select(PERIOD_SELECT)
    .eq("school_id", schoolId)
    .eq("class_id", classId)
    .eq("section_id", sectionId)
    .order("day_key")
    .order("period_order");

  const byDay: Record<string, Row[]> = {};
  for (const key of VALID_DAY_KEYS) byDay[key] = [];
  const fridayOverride: Row[] = [];

  for (const row of (data || []) as Row[]) {
    const decorated = decoratePeriod(row);
    if (row.schedule_type === "friday") {
      fridayOverride.push(decorated);
    } else {
      const dayKey = String(row.day_key);
      if (byDay[dayKey]) byDay[dayKey].push(decorated);
    }
  }

  return { days: byDay, fridayOverride, hasFridayOverride: fridayOverride.length > 0 };
}

// Resolves what a class/section actually shows for one calendar day,
// applying the "Friday override shadows the normal Friday row" rule.
async function getEffectiveDayPeriods(
  db: Db,
  schoolId: number,
  classId: number,
  sectionId: number,
  dayKey: string,
): Promise<Row[]> {
  if (dayKey === "friday") {
    const { data: overrideRows } = await db
      .from("timetable_periods")
      .select(PERIOD_SELECT)
      .eq("school_id", schoolId)
      .eq("class_id", classId)
      .eq("section_id", sectionId)
      .eq("schedule_type", "friday")
      .order("period_order");
    if (overrideRows && overrideRows.length) return (overrideRows as Row[]).map(decoratePeriod);
  }

  const { data } = await db
    .from("timetable_periods")
    .select(PERIOD_SELECT)
    .eq("school_id", schoolId)
    .eq("class_id", classId)
    .eq("section_id", sectionId)
    .eq("schedule_type", "default")
    .eq("day_key", dayKey)
    .order("period_order");
  return ((data || []) as Row[]).map(decoratePeriod);
}

function rangeToDayKeys(range: string): string[] {
  const today = new Date();
  const jsDay = today.getDay(); // 0 = Sunday
  const order = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  if (range === "week") return VALID_DAY_KEYS.slice();
  if (range === "tomorrow") return [order[(jsDay + 1) % 7]];
  return [order[jsDay]];
}

// Every other class/section's effective schedule for one day, excluding the
// class currently being edited — used both for the busy-teacher lookup and
// for conflict validation on save.
async function getOtherClassesEffectivePeriods(
  db: Db,
  schoolId: number,
  dayKey: string,
  excludeClassId: number | null,
  excludeSectionId: number | null,
): Promise<Row[]> {
  const { data } = await db
    .from("timetable_periods")
    .select(
      `class_id, section_id, day_key, schedule_type, teacher_id, start_time, end_time,
       classes(id, class_name), sections(id, section_name)`,
    )
    .eq("school_id", schoolId)
    .eq("day_key", dayKey)
    .not("teacher_id", "is", null);

  const rows = (data || []) as Row[];
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    if (excludeClassId && excludeSectionId && Number(row.class_id) === excludeClassId && Number(row.section_id) === excludeSectionId) {
      continue;
    }
    const key = `${row.class_id}:${row.section_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  const effective: Row[] = [];
  for (const groupRows of grouped.values()) {
    const overrideRows = dayKey === "friday" ? groupRows.filter((r) => r.schedule_type === "friday") : [];
    effective.push(...(overrideRows.length ? overrideRows : groupRows.filter((r) => r.schedule_type === "default")));
  }
  return effective;
}

export async function handleTimetable(req: Request, path: string, url: URL): Promise<Response> {
  const method = req.method;

  let user: Row;
  try {
    user = await verifyToken(req);
  } catch {
    return json({ message: "Unauthorized" }, 401);
  }

  const db = getDb();
  const isAdminRole = user.role === "admin" || user.role === "org_admin";

  // ── GET /timetable/class — editor bootstrap ───────────────────────
  if (path === "/timetable/class" && method === "GET") {
    if (!isAdminRole) return json({ message: "Forbidden" }, 403);
    const classId = toNumber(url.searchParams.get("class_id"));
    const sectionId = toNumber(url.searchParams.get("section_id"));
    if (!classId || !sectionId) return json({ message: "class_id and section_id are required" }, 400);

    const scope = await resolveSchoolScope(db, user, url.searchParams.get("school_id"));
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid school scope" }, 403);

    try {
      const scopeCheck = await assertClassSectionScope(db, scope.schoolId, classId, sectionId);
      if (scopeCheck.error) return scopeCheck.error;
      const week = await getClassWeek(db, scope.schoolId, classId, sectionId);
      return json({
        school_id: scope.schoolId,
        class_id: classId,
        section_id: sectionId,
        class_name: (scopeCheck.classRow as Row).class_name,
        section_name: (scopeCheck.sectionRow as Row).section_name,
        ...week,
      });
    } catch (err) {
      console.error("[timetable/class GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT /timetable/class/day — replace one day, save immediately ──
  if (path === "/timetable/class/day" && method === "PUT") {
    if (!isAdminRole) return json({ message: "Forbidden" }, 403);

    const body = (await req.json().catch(() => null)) as Row | null;
    const classId = toNumber(body?.class_id);
    const sectionId = toNumber(body?.section_id);
    const dayKey = normalizeDayKey(body?.day_key);
    const scheduleType = body?.schedule_type === "friday" ? "friday" : "default";
    const periodsInput = Array.isArray(body?.periods) ? (body?.periods as Row[]) : [];

    if (!classId || !sectionId) return json({ message: "class_id and section_id are required" }, 400);
    if (!VALID_DAY_KEY_SET.has(dayKey)) return json({ message: "Invalid day" }, 400);
    if (scheduleType === "friday" && dayKey !== "friday") {
      return json({ message: "A Friday override can only apply to Friday" }, 400);
    }

    const scope = await resolveSchoolScope(db, user, body?.school_id);
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid school scope" }, 403);

    try {
      const scopeCheck = await assertClassSectionScope(db, scope.schoolId, classId, sectionId);
      if (scopeCheck.error) return scopeCheck.error;

      const subjectIds = Array.from(new Set(periodsInput.map((p) => toNumber(p.subject_id)).filter((v): v is number => v !== null)));
      const teacherIds = Array.from(new Set(periodsInput.map((p) => toNumber(p.teacher_id)).filter((v): v is number => v !== null)));

      const [{ data: subjects }, { data: teachers }] = await Promise.all([
        subjectIds.length ? db.from("subjects").select("id, school_id").in("id", subjectIds) : Promise.resolve({ data: [] as Row[] }),
        teacherIds.length ? db.from("teachers").select("id, school_id").in("id", teacherIds) : Promise.resolve({ data: [] as Row[] }),
      ]);
      const validSubjectIds = new Set((subjects || []).filter((r: Row) => Number(r.school_id) === scope.schoolId).map((r: Row) => Number(r.id)));
      const validTeacherIds = new Set((teachers || []).filter((r: Row) => Number(r.school_id) === scope.schoolId).map((r: Row) => Number(r.id)));

      const normalized: { subject_id: number | null; teacher_id: number | null; start_time: string; end_time: string }[] = [];
      for (const [index, p] of periodsInput.entries()) {
        const startTime = ensureTimeValue(p.start_time);
        const endTime = ensureTimeValue(p.end_time);
        if (!startTime || !endTime) return json({ message: `Valid start/end time required at period ${index + 1}` }, 400);
        if (startTime >= endTime) return json({ message: `Period ${index + 1} must end after it starts` }, 400);

        const subjectId = toNumber(p.subject_id);
        const teacherId = toNumber(p.teacher_id);
        if (subjectId && !validSubjectIds.has(subjectId)) return json({ message: `Invalid subject at period ${index + 1}` }, 400);
        if (teacherId && !validTeacherIds.has(teacherId)) return json({ message: `Invalid teacher at period ${index + 1}` }, 400);

        normalized.push({ subject_id: subjectId, teacher_id: teacherId, start_time: startTime, end_time: endTime });
      }

      // Reject overlapping periods within the submitted day itself.
      const sorted = [...normalized].sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
      for (let i = 1; i < sorted.length; i++) {
        if (timesOverlap(sorted[i - 1].start_time, sorted[i - 1].end_time, sorted[i].start_time, sorted[i].end_time)) {
          return json({ message: "Periods on this day overlap in time" }, 400);
        }
      }

      // Teacher-conflict check against every other class's effective
      // schedule for this same calendar day.
      const others = await getOtherClassesEffectivePeriods(db, scope.schoolId, dayKey, classId, sectionId);
      for (const period of normalized) {
        if (!period.teacher_id) continue;
        const conflict = others.find((o) => {
          if (Number(o.teacher_id) !== period.teacher_id) return false;
          const oStart = String(o.start_time).slice(0, 5);
          const oEnd = String(o.end_time).slice(0, 5);
          return timesOverlap(period.start_time, period.end_time, oStart, oEnd);
        });
        if (conflict) {
          const className = (conflict.classes as Row | null)?.class_name || "another class";
          const sectionName = (conflict.sections as Row | null)?.section_name || "";
          return json(
            { message: `Teacher is already booked for ${className} ${sectionName} at ${period.start_time}-${period.end_time}` },
            409,
          );
        }
      }

      await db
        .from("timetable_periods")
        .delete()
        .eq("school_id", scope.schoolId)
        .eq("class_id", classId)
        .eq("section_id", sectionId)
        .eq("schedule_type", scheduleType)
        .eq("day_key", dayKey);

      if (normalized.length) {
        await db.from("timetable_periods").insert(
          normalized.map((p, index) => ({
            school_id: scope.schoolId,
            class_id: classId,
            section_id: sectionId,
            day_key: dayKey,
            schedule_type: scheduleType,
            period_order: index + 1,
            subject_id: p.subject_id,
            teacher_id: p.teacher_id,
            start_time: p.start_time,
            end_time: p.end_time,
            updated_by_role: String(user.role || ""),
            updated_by_id: toNumber(user.id),
          })),
        );
      }

      const week = await getClassWeek(db, scope.schoolId, classId, sectionId);
      return json({ message: "Day updated", ...week });
    } catch (err) {
      console.error("[timetable/class/day PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /timetable/class/day — clear one day (e.g. remove Friday override) ──
  if (path === "/timetable/class/day" && method === "DELETE") {
    if (!isAdminRole) return json({ message: "Forbidden" }, 403);
    const classId = toNumber(url.searchParams.get("class_id"));
    const sectionId = toNumber(url.searchParams.get("section_id"));
    const dayKey = normalizeDayKey(url.searchParams.get("day_key"));
    const scheduleType = url.searchParams.get("schedule_type") === "friday" ? "friday" : "default";
    if (!classId || !sectionId) return json({ message: "class_id and section_id are required" }, 400);
    if (!VALID_DAY_KEY_SET.has(dayKey)) return json({ message: "Invalid day" }, 400);

    const scope = await resolveSchoolScope(db, user, url.searchParams.get("school_id"));
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid school scope" }, 403);

    try {
      const scopeCheck = await assertClassSectionScope(db, scope.schoolId, classId, sectionId);
      if (scopeCheck.error) return scopeCheck.error;

      await db
        .from("timetable_periods")
        .delete()
        .eq("school_id", scope.schoolId)
        .eq("class_id", classId)
        .eq("section_id", sectionId)
        .eq("schedule_type", scheduleType)
        .eq("day_key", dayKey);

      const week = await getClassWeek(db, scope.schoolId, classId, sectionId);
      return json({ message: "Day cleared", ...week });
    } catch (err) {
      console.error("[timetable/class/day DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /timetable/class — wipe a class's entire timetable ─────
  if (path === "/timetable/class" && method === "DELETE") {
    if (!isAdminRole) return json({ message: "Forbidden" }, 403);
    const classId = toNumber(url.searchParams.get("class_id"));
    const sectionId = toNumber(url.searchParams.get("section_id"));
    if (!classId || !sectionId) return json({ message: "class_id and section_id are required" }, 400);

    const scope = await resolveSchoolScope(db, user, url.searchParams.get("school_id"));
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid school scope" }, 403);

    try {
      const scopeCheck = await assertClassSectionScope(db, scope.schoolId, classId, sectionId);
      if (scopeCheck.error) return scopeCheck.error;

      await db
        .from("timetable_periods")
        .delete()
        .eq("school_id", scope.schoolId)
        .eq("class_id", classId)
        .eq("section_id", sectionId);

      return json({ message: "Timetable deleted" });
    } catch (err) {
      console.error("[timetable/class DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /timetable/copy — copy one class's timetable to another ──
  if (path === "/timetable/copy" && method === "POST") {
    if (!isAdminRole) return json({ message: "Forbidden" }, 403);

    const body = (await req.json().catch(() => null)) as Row | null;
    const fromClassId = toNumber(body?.from_class_id);
    const fromSectionId = toNumber(body?.from_section_id);
    const toClassId = toNumber(body?.to_class_id);
    const toSectionId = toNumber(body?.to_section_id);
    const includeFriday = body?.include_friday !== false;
    if (!fromClassId || !fromSectionId || !toClassId || !toSectionId) {
      return json({ message: "from/to class and section are required" }, 400);
    }
    if (fromClassId === toClassId && fromSectionId === toSectionId) {
      return json({ message: "Source and target must be different" }, 400);
    }

    const scope = await resolveSchoolScope(db, user, body?.school_id);
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid school scope" }, 403);

    try {
      const [fromCheck, toCheck] = await Promise.all([
        assertClassSectionScope(db, scope.schoolId, fromClassId, fromSectionId),
        assertClassSectionScope(db, scope.schoolId, toClassId, toSectionId),
      ]);
      if (fromCheck.error) return fromCheck.error;
      if (toCheck.error) return toCheck.error;

      const { data: sourceRows } = await db
        .from("timetable_periods")
        .select("day_key, schedule_type, period_order, subject_id, teacher_id, start_time, end_time")
        .eq("school_id", scope.schoolId)
        .eq("class_id", fromClassId)
        .eq("section_id", fromSectionId);

      const rowsToCopy = ((sourceRows || []) as Row[]).filter((r) => includeFriday || r.schedule_type !== "friday");
      if (!rowsToCopy.length) return json({ message: "Source timetable is empty" }, 400);

      // Conflict check per day against the target's siblings (excluding the
      // target class itself, which is about to be fully replaced anyway).
      const conflicts: { day_key: string; start_time: string; end_time: string; class_name: string | null; section_name: string | null }[] = [];
      const byDay = new Map<string, Row[]>();
      for (const row of rowsToCopy) {
        const key = `${row.day_key}:${row.schedule_type}`;
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key)!.push(row);
      }

      const finalRows: Row[] = [];
      for (const [key, rows] of byDay.entries()) {
        const [dayKey] = key.split(":");
        const others = await getOtherClassesEffectivePeriods(db, scope.schoolId, dayKey, toClassId, toSectionId);
        for (const row of rows) {
          let teacherId = toNumber(row.teacher_id);
          if (teacherId) {
            const startTime = String(row.start_time).slice(0, 5);
            const endTime = String(row.end_time).slice(0, 5);
            const conflict = others.find((o) => {
              if (Number(o.teacher_id) !== teacherId) return false;
              return timesOverlap(startTime, endTime, String(o.start_time).slice(0, 5), String(o.end_time).slice(0, 5));
            });
            if (conflict) {
              conflicts.push({
                day_key: dayKey,
                start_time: startTime,
                end_time: endTime,
                class_name: (conflict.classes as Row | null)?.class_name || null,
                section_name: (conflict.sections as Row | null)?.section_name || null,
              });
              teacherId = null; // drop the teacher on the copy; admin reassigns manually
            }
          }
          finalRows.push({ ...row, teacher_id: teacherId });
        }
      }

      let deleteQuery = db
        .from("timetable_periods")
        .delete()
        .eq("school_id", scope.schoolId)
        .eq("class_id", toClassId)
        .eq("section_id", toSectionId);
      if (!includeFriday) {
        // Leave the target's existing Friday override (if any) untouched —
        // only replace its default weekly schedule.
        deleteQuery = deleteQuery.eq("schedule_type", "default");
      }
      await deleteQuery;

      await db.from("timetable_periods").insert(
        finalRows.map((row) => ({
          school_id: scope.schoolId,
          class_id: toClassId,
          section_id: toSectionId,
          day_key: row.day_key,
          schedule_type: row.schedule_type,
          period_order: row.period_order,
          subject_id: row.subject_id,
          teacher_id: row.teacher_id,
          start_time: row.start_time,
          end_time: row.end_time,
          updated_by_role: String(user.role || ""),
          updated_by_id: toNumber(user.id),
        })),
      );

      const week = await getClassWeek(db, scope.schoolId, toClassId, toSectionId);
      return json({
        message: conflicts.length ? "Copied with teacher conflicts skipped" : "Timetable copied",
        conflicts,
        ...week,
      });
    } catch (err) {
      console.error("[timetable/copy POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /timetable/teacher-busy — grey out already-booked teachers ─
  if (path === "/timetable/teacher-busy" && method === "GET") {
    if (!isAdminRole) return json({ message: "Forbidden" }, 403);
    const dayKey = normalizeDayKey(url.searchParams.get("day_key"));
    if (!VALID_DAY_KEY_SET.has(dayKey)) return json({ message: "Invalid day" }, 400);
    const excludeClassId = toNumber(url.searchParams.get("exclude_class_id"));
    const excludeSectionId = toNumber(url.searchParams.get("exclude_section_id"));

    const scope = await resolveSchoolScope(db, user, url.searchParams.get("school_id"));
    if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid school scope" }, 403);

    try {
      const others = await getOtherClassesEffectivePeriods(db, scope.schoolId, dayKey, excludeClassId, excludeSectionId);
      const byTeacher: Record<string, Row[]> = {};
      for (const row of others) {
        const tid = String(row.teacher_id);
        if (!byTeacher[tid]) byTeacher[tid] = [];
        byTeacher[tid].push({
          start_time: String(row.start_time).slice(0, 5),
          end_time: String(row.end_time).slice(0, 5),
          class_name: (row.classes as Row | null)?.class_name || null,
          section_name: (row.sections as Row | null)?.section_name || null,
        });
      }
      return json({ busy: byTeacher });
    } catch (err) {
      console.error("[timetable/teacher-busy GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /timetable/teacher — own schedule, aggregated across classes ──
  if (path === "/timetable/teacher" && method === "GET") {
    if (user.role !== "teacher") return json({ message: "Forbidden" }, 403);
    const teacherId = toNumber(user.id);
    const schoolId = toNumber(user.school_id);
    if (!teacherId || !schoolId) return json({ message: "Invalid teacher scope" }, 403);
    const range = String(url.searchParams.get("range") || "today");

    try {
      const dayKeys = rangeToDayKeys(range === "week" || range === "tomorrow" ? range : "today");
      const byDay: Record<string, Row[]> = {};
      for (const dayKey of dayKeys) {
        const { data } = await db
          .from("timetable_periods")
          .select(
            `id, class_id, section_id, day_key, schedule_type, period_order, subject_id, teacher_id, start_time, end_time,
             subjects(id, name), classes(id, class_name), sections(id, section_name)`,
          )
          .eq("school_id", schoolId)
          .eq("teacher_id", teacherId)
          .eq("day_key", dayKey);

        const rows = (data || []) as Row[];
        const overrideRows = rows.filter((r) => r.schedule_type === "friday");
        const defaultRows = rows.filter((r) => r.schedule_type === "default");
        const effective = dayKey === "friday" && overrideRows.length ? overrideRows : defaultRows;

        byDay[dayKey] = effective
          .map((row) => ({
            class_id: row.class_id,
            section_id: row.section_id,
            class_name: (row.classes as Row | null)?.class_name || null,
            section_name: (row.sections as Row | null)?.section_name || null,
            subject_id: row.subject_id,
            subject_name: (row.subjects as Row | null)?.name || null,
            start_time: String(row.start_time).slice(0, 5),
            end_time: String(row.end_time).slice(0, 5),
          }))
          .sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
      }
      return json({ range, days: byDay });
    } catch (err) {
      console.error("[timetable/teacher GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /timetable/student — own class schedule ────────────────────
  if (path === "/timetable/student" && method === "GET") {
    if (user.role !== "student") return json({ message: "Forbidden" }, 403);
    const tokenStudentId = toNumber(user.student_id) || toNumber(user.id);
    if (!tokenStudentId) return json({ message: "Student scope is incomplete" }, 400);
    const range = String(url.searchParams.get("range") || "today");

    try {
      const { data: student } = await db
        .from("students")
        .select("school_id, class_id, section_id")
        .eq("id", tokenStudentId)
        .maybeSingle();
      if (!student) return json({ message: "Student not found" }, 404);

      const schoolId = Number((student as Row).school_id);
      const classId = Number((student as Row).class_id);
      const sectionId = Number((student as Row).section_id);
      if (!schoolId || !classId || !sectionId) return json({ message: "Student scope is incomplete" }, 400);

      return json(await buildStudentSchedule(db, schoolId, classId, sectionId, range));
    } catch (err) {
      console.error("[timetable/student GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /timetable/parent/:studentId — child's class schedule ─────
  const parentMatch = path.match(/^\/timetable\/parent\/(\d+)$/);
  if (parentMatch && method === "GET") {
    if (user.role !== "parent") return json({ message: "Forbidden" }, 403);
    const studentId = Number(parentMatch[1]);
    const range = String(url.searchParams.get("range") || "today");

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

      const schoolId = Number((student as Row).school_id);
      const classId = Number((student as Row).class_id);
      const sectionId = Number((student as Row).section_id);

      return json(await buildStudentSchedule(db, schoolId, classId, sectionId, range));
    } catch (err) {
      console.error("[timetable/parent GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── Teacher-subject assignments (unrelated to the schedule grid;
  //    used by the Teachers management screen) — carried over as-is ──
  if (path === "/timetable/teacher-subjects" && method === "PUT") {
    if (user.role !== "admin" && user.role !== "org_admin" && user.role !== "super_admin") {
      return json({ message: "Forbidden" }, 403);
    }
    const body = (await req.json().catch(() => null)) as Row | null;
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
        const invalid = (subjects || []).filter((s: Row) => Number(s.school_id) !== scope.schoolId);
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
      const { data: teacherRow } = await db.from("teachers").select("id, school_id").eq("id", teacherId).maybeSingle();
      if (!teacherRow) return json({ message: "Teacher not found" }, 404);
      const scope = await resolveSchoolScope(db, user, Number(teacherRow.school_id));
      if (scope.error || !scope.schoolId) return scope.error || json({ message: "Invalid scope" }, 403);
      if (Number(teacherRow.school_id) !== scope.schoolId) return json({ message: "Forbidden" }, 403);
      const { data: rows } = await db.from("teacher_subject_assignments").select("subject_id").eq("teacher_id", teacherId);
      const subject_ids = (rows || []).map((r: Row) => Number(r.subject_id));
      return json({ teacher_id: teacherId, subject_ids });
    } catch (err) {
      console.error("[timetable/teacher-subjects GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}

async function buildStudentSchedule(db: Db, schoolId: number, classId: number, sectionId: number, range: string) {
  const dayKeys = rangeToDayKeys(range === "week" || range === "tomorrow" ? range : "today");
  const byDay: Record<string, Row[]> = {};
  for (const dayKey of dayKeys) {
    const periods = await getEffectiveDayPeriods(db, schoolId, classId, sectionId, dayKey);
    byDay[dayKey] = periods;
  }
  return { school_id: schoolId, class_id: classId, section_id: sectionId, range, days: byDay };
}

// handlers/attendance.ts — mark attendance, get report
import {
  json,
  getDb,
  verifyToken,
  sendPush,
  tokensForStudents,
  resolveTeacherRole,
} from "../_shared.ts";

export async function handleAttendance(
  req: Request,
  path: string,
  url: URL,
): Promise<Response> {
  const method = req.method;

  let user: Record<string, unknown>;
  try {
    user = await verifyToken(req);
  } catch {
    return json({ message: "Unauthorized" }, 401);
  }

  const db = getDb();

  // ── POST /attendance/mark ────────────────────────────────────
  if (path === "/attendance/mark" && method === "POST") {
    if (user.role !== "teacher")
      return json({ message: "Forbidden" }, 403);

    try {
      const teacherRole = await resolveTeacherRole(db, user.id as number);
      if (teacherRole === "subject_teacher")
        return json({ message: "Subject teachers cannot mark attendance" }, 403);

      const { date, records } = await req.json();
      if (!date || !Array.isArray(records) || !records.length)
        return json({ message: "date and records[] are required" }, 400);

      const teacherId = user.id as number;
      let locked = 0;
      const savedIds: number[] = [];

      for (const r of records) {
        // Never overwrite an approved leave
        const { data: approvedLeave } = await db
          .from("leave_applications")
          .select("id")
          .eq("student_id", r.student_id)
          .eq("date", date)
          .eq("status", "approved");

        if (approvedLeave?.length) { locked++; continue; }

        await db.from("student_attendance").upsert(
          {
            student_id: r.student_id,
            teacher_id: teacherId,
            date,
            status: r.status,
          },
          { onConflict: "student_id,date" },
        );
        savedIds.push(r.student_id);
      }

      // Push notifications (non-blocking)
      if (savedIds.length) {
        tokensForStudents(db, savedIds).then((tokens) =>
          sendPush(tokens, "Attendance Marked", `Your attendance has been recorded for ${date}.`, {
            type: "attendance",
            date,
          })
        );
      }

      return json({ message: "Attendance saved successfully", count: savedIds.length, locked });
    } catch (err) {
      console.error("[attendance/mark]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /attendance/report ───────────────────────────────────
  if (path === "/attendance/report" && method === "GET") {
    try {
      if (user.role === "teacher") {
        const teacherRole = await resolveTeacherRole(db, user.id as number);
        if (teacherRole === "subject_teacher") {
          return json({ message: "Subject teachers cannot access attendance reports" }, 403);
        }
      }

      const class_id = url.searchParams.get("class_id");
      const section_id = url.searchParams.get("section_id");
      const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
      const schoolId = user.school_id as number;

      if (!class_id || !section_id)
        return json({ message: "class_id and section_id are required" }, 400);

      // Get students with their attendance and leave status
      const { data: students } = await db
        .from("students")
        .select("id, first_name, last_name, roll_no")
        .eq("class_id", class_id)
        .eq("section_id", section_id)
        .eq("school_id", schoolId)
        .order("last_name")
        .order("first_name");

      if (!students?.length) return json({ date, class_id, section_id, records: [] });

      const studentIds = students.map((s: Record<string, unknown>) => s.id);

      const [{ data: attendance }, { data: approvedLeaves }] = await Promise.all([
        db
          .from("student_attendance")
          .select("student_id, status")
          .in("student_id", studentIds)
          .eq("date", date),
        db
          .from("leave_applications")
          .select("student_id")
          .in("student_id", studentIds)
          .eq("date", date)
          .eq("status", "approved"),
      ]);

      const attMap: Record<number, string> = {};
      (attendance || []).forEach((a: Record<string, unknown>) => {
        attMap[a.student_id as number] = a.status as string;
      });
      const leaveSet = new Set(
        (approvedLeaves || []).map((l: Record<string, unknown>) => l.student_id),
      );

      const records = students.map((s: Record<string, unknown>) => ({
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        roll_no: s.roll_no,
        status: attMap[s.id as number] || "not_marked",
        leave_locked: leaveSet.has(s.id),
      }));

      return json({ date, class_id, section_id, records });
    } catch (err) {
      console.error("[attendance/report]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /attendance/monthly ──────────────────────────────────
  // Params: class_id, section_id, year, month, student_id (optional)
  // Returns each student with per-day status + summary counts
  if (path === "/attendance/monthly" && method === "GET") {
    try {
      if (user.role === "teacher") {
        const teacherRole = await resolveTeacherRole(db, user.id as number);
        if (teacherRole === "subject_teacher") {
          return json({ message: "Subject teachers cannot access attendance reports" }, 403);
        }
      }

      const class_id   = url.searchParams.get("class_id");
      const section_id = url.searchParams.get("section_id");
      const studentIdParam = url.searchParams.get("student_id");
      const year  = parseInt(url.searchParams.get("year")  || String(new Date().getFullYear()));
      const month = parseInt(url.searchParams.get("month") || String(new Date().getMonth() + 1));
      const schoolId = user.school_id as number;

      if (!class_id || !section_id)
        return json({ message: "class_id and section_id are required" }, 400);

      const from = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const to   = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      let sq = db
        .from("students")
        .select("id, first_name, last_name, roll_no")
        .eq("class_id", class_id)
        .eq("section_id", section_id)
        .eq("school_id", schoolId)
        .order("last_name")
        .order("first_name");
      if (studentIdParam) sq = sq.eq("id", studentIdParam);
      const { data: students } = await sq;

      if (!students?.length) return json([]);

      const studentIds = (students as Record<string, unknown>[]).map((s) => s.id as number);

      const { data: attendance } = await db
        .from("student_attendance")
        .select("student_id, date, status")
        .in("student_id", studentIds)
        .gte("date", from)
        .lte("date", to);

      // Build lookup: studentId → { date → status }
      const lookup: Record<number, Record<string, string>> = {};
      for (const a of (attendance || []) as Record<string, unknown>[]) {
        const sid = a.student_id as number;
        if (!lookup[sid]) lookup[sid] = {};
        lookup[sid][a.date as string] = a.status as string;
      }

      const result = (students as Record<string, unknown>[]).map((s) => {
        const sid  = s.id as number;
        const days = lookup[sid] || {};
        let present = 0, absent = 0, leave = 0;
        const dayList: { date: string; status: string }[] = [];
        for (let d = 1; d <= lastDay; d++) {
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const status  = days[dateStr] || "not_marked";
          dayList.push({ date: dateStr, status });
          if (status === "present") present++;
          else if (status === "absent") absent++;
          else if (status === "leave") leave++;
        }
        return {
          id:         s.id,
          first_name: s.first_name,
          last_name:  s.last_name,
          roll_no:    s.roll_no,
          summary: { present, absent, leave },
          days: dayList,
        };
      });

      return json(result);
    } catch (err) {
      console.error("[attendance/monthly]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}

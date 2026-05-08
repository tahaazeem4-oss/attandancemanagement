// handlers/attendance.ts — mark attendance, get report
import {
  json,
  getDb,
  verifyToken,
  sendPush,
  tokensForStudents,
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

  return json({ message: "Not found" }, 404);
}

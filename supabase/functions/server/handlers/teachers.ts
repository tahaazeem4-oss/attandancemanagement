// handlers/teachers.ts — teacher routes
import {
  json,
  getDb,
  verifyToken,
  sendPush,
  tokensForStudents,
} from "../_shared.ts";

export async function handleTeachers(
  req: Request,
  path: string,
  _url: URL,
): Promise<Response> {
  const method = req.method;

  let user: Record<string, unknown>;
  try {
    user = await verifyToken(req);
  } catch {
    return json({ message: "Unauthorized" }, 401);
  }
  if (user.role !== "teacher")
    return json({ message: "Forbidden" }, 403);

  const db = getDb();
  const teacherId = user.id as number;
  const schoolId = user.school_id as number;

  // ── GET /teachers/attendance/today ───────────────────────────
  if (path === "/teachers/attendance/today" && method === "GET") {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await db
        .from("teacher_attendance")
        .select("status, check_in, date")
        .eq("teacher_id", teacherId)
        .eq("date", today)
        .maybeSingle();
      return json(data);
    } catch (err) {
      console.error("[teachers/attendance/today]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /teachers/attendance ────────────────────────────────
  if (path === "/teachers/attendance" && method === "POST") {
    try {
      const { status } = await req.json();
      if (!["present", "absent", "leave"].includes(status))
        return json({ message: "Invalid status" }, 400);

      const today = new Date().toISOString().slice(0, 10);
      const { data } = await db
        .from("teacher_attendance")
        .upsert(
          { teacher_id: teacherId, date: today, status, check_in: new Date().toISOString() },
          { onConflict: "teacher_id,date" },
        )
        .select()
        .single();
      return json({ message: "Attendance marked", date: today, status: data?.status });
    } catch (err) {
      console.error("[teachers/attendance POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /teachers/classes ────────────────────────────────────
  if (path === "/teachers/classes" && method === "GET") {
    try {
      const { data } = await db
        .from("teacher_classes")
        .select(
          `class_id, section_id,
           classes!inner(class_name),
           sections!inner(section_name)`,
        )
        .eq("teacher_id", teacherId);

      const rows = (data || []).map((r: Record<string, unknown>) => ({
        class_id: r.class_id,
        section_id: r.section_id,
        class_name: (r.classes as Record<string, unknown>).class_name,
        section_name: (r.sections as Record<string, unknown>).section_name,
      }));
      return json(rows);
    } catch (err) {
      console.error("[teachers/classes]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /teachers/leaves ─────────────────────────────────────
  if (path === "/teachers/leaves" && method === "GET") {
    try {
      // Get all class/section combos for this teacher
      const { data: assignments } = await db
        .from("teacher_classes")
        .select("class_id, section_id")
        .eq("teacher_id", teacherId);

      if (!assignments?.length) return json([]);

      // Collect student IDs for each assignment (class_id + optional section_id)
      const allStudentIds: number[] = [];
      for (const a of assignments as Record<string, unknown>[]) {
        let q = db
          .from("students")
          .select("id")
          .eq("school_id", schoolId)
          .eq("class_id", a.class_id as number);
        if (a.section_id) q = q.eq("section_id", a.section_id as number);
        const { data: studs } = await q;
        for (const s of studs || [])
          allStudentIds.push((s as Record<string, unknown>).id as number);
      }

      const studentIds = [...new Set(allStudentIds)];
      if (!studentIds.length) return json([]);

      const { data: leaves } = await db
        .from("leave_applications")
        .select(
          `id, group_id, student_id, date, reason, status, withdrawal_status, applied_at,
           students!inner(first_name, last_name, roll_no, class_id, section_id,
             classes!inner(class_name), sections!inner(section_name)
           )`,
        )
        .in("student_id", studentIds)
        .order("applied_at", { ascending: false });

      // Group by group_id
      const grouped: Record<string, unknown> = {};
      for (const row of leaves || []) {
        const r = row as Record<string, unknown>;
        const s = r.students as Record<string, unknown>;
        const gid = r.group_id as string;
        if (!grouped[gid]) {
          grouped[gid] = {
            group_id: gid,
            student_id: r.student_id,
            student_name: `${s.first_name} ${s.last_name}`,
            roll_no: s.roll_no,
            class_name: (s.classes as Record<string, unknown>).class_name,
            section_name: (s.sections as Record<string, unknown>).section_name,
            reason: r.reason,
            status: r.status,
            withdrawal_status: r.withdrawal_status,
            dates: [],
            applied_at: r.applied_at,
          };
        }
        (grouped[gid] as Record<string, unknown[]>).dates.push(r.date as string);
        // Priority: rejected > approved > pending
        const priority: Record<string, number> = { rejected: 0, approved: 1, pending: 2 };
        const cur = (grouped[gid] as Record<string, unknown>).status as string;
        const next = r.status as string;
        if (priority[next] < priority[cur]) {
          (grouped[gid] as Record<string, unknown>).status = next;
        }
      }

      return json(Object.values(grouped));
    } catch (err) {
      console.error("[teachers/leaves]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT /teachers/leaves/group/:id/status ────────────────────
  const leaveGroupStatusMatch = path.match(
    /^\/teachers\/leaves\/group\/([^/]+)\/status$/,
  );
  if (leaveGroupStatusMatch && method === "PUT") {
    const groupId = leaveGroupStatusMatch[1];
    try {
      const { status } = await req.json();
      if (!["approved", "rejected"].includes(status))
        return json({ message: "Invalid status" }, 400);

      const { data: leaves } = await db
        .from("leave_applications")
        .select("id, student_id, date")
        .eq("group_id", groupId);

      if (!leaves?.length)
        return json({ message: "Leave group not found" }, 404);

      await db
        .from("leave_applications")
        .update({ status })
        .eq("group_id", groupId);

      const studentId = (leaves[0] as Record<string, unknown>).student_id as number;

      // If approved, insert student_attendance rows as 'leave'
      if (status === "approved") {
        for (const leave of leaves) {
          const l = leave as Record<string, unknown>;
          await db.from("student_attendance").upsert(
            {
              student_id: studentId,
              teacher_id: teacherId,
              date: l.date,
              status: "leave",
            },
            { onConflict: "student_id,date" },
          );
        }
        tokensForStudents(db, [studentId]).then((tokens) =>
          sendPush(tokens, "Leave Approved", "Your leave request has been approved.", { type: "leave" })
        );
      } else {
        // rejected — notify student
        tokensForStudents(db, [studentId]).then((tokens) =>
          sendPush(tokens, "Leave Rejected", "Your leave request has been rejected by your teacher.", { type: "leave" })
        );
      }

      return json({ message: "Status updated", count: leaves.length });
    } catch (err) {
      console.error("[teachers/leaves/group/status]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT /teachers/leaves/group/:id/withdrawal ────────────────
  const leaveGroupWithdrawalMatch = path.match(
    /^\/teachers\/leaves\/group\/([^/]+)\/withdrawal$/,
  );
  if (leaveGroupWithdrawalMatch && method === "PUT") {
    const groupId = leaveGroupWithdrawalMatch[1];
    try {
      const { action } = await req.json();
      if (!["approve", "reject"].includes(action))
        return json({ message: "Invalid action" }, 400);

      const { data: leaves, error: leavesErr } = await db
        .from("leave_applications")
        .select("id, student_id, date")
        .eq("group_id", groupId)
        .eq("withdrawal_status", "pending");

      if (leavesErr) {
        console.error("[teachers/leaves/group/withdrawal] fetch error", leavesErr);
        return json({ message: "Server error" }, 500);
      }

      if (!leaves?.length)
        return json({ message: "No pending withdrawal found for this group" }, 404);

      const studentId = (leaves[0] as Record<string, unknown>).student_id as number;

      if (action === "approve") {
        // Schema constraint allows withdrawal_status only as pending/rejected, so
        // approval clears withdrawal_status and cancels the leave.
        const { error: updateErr } = await db
          .from("leave_applications")
          .update({ status: "cancelled", withdrawal_status: null })
          .eq("group_id", groupId)
          .eq("withdrawal_status", "pending");

        if (updateErr) {
          console.error("[teachers/leaves/group/withdrawal] update error", updateErr);
          return json({ message: "Could not approve withdrawal" }, 500);
        }

        for (const leave of leaves) {
          const l = leave as Record<string, unknown>;
          const { error: deleteErr } = await db
            .from("student_attendance")
            .delete()
            .eq("student_id", studentId)
            .eq("date", l.date)
            .eq("status", "leave");
          if (deleteErr) {
            console.error("[teachers/leaves/group/withdrawal] attendance delete error", deleteErr);
            return json({ message: "Could not unlock attendance" }, 500);
          }
        }
        tokensForStudents(db, [studentId]).then((tokens) =>
          sendPush(tokens, "Withdrawal Approved", "Your leave withdrawal has been approved. Attendance unlocked.", { type: "leave" })
        );
      } else {
        const { error: rejectErr } = await db
          .from("leave_applications")
          .update({ withdrawal_status: "rejected" })
          .eq("group_id", groupId)
          .eq("withdrawal_status", "pending");
        if (rejectErr) {
          console.error("[teachers/leaves/group/withdrawal] reject error", rejectErr);
          return json({ message: "Could not reject withdrawal" }, 500);
        }
        tokensForStudents(db, [studentId]).then((tokens) =>
          sendPush(tokens, "Withdrawal Rejected", "Your leave withdrawal request was declined.", { type: "leave" })
        );
      }

      return json({ message: "Withdrawal processed" });
    } catch (err) {
      console.error("[teachers/leaves/group/withdrawal]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}

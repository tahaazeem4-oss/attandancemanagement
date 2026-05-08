// handlers/studentPortal.ts — student attendance and leaves
import {
  json,
  getDb,
  verifyToken,
  sendPush,
  tokensForClassTeachers,
  tokensForSchoolAdmins,
} from "../_shared.ts";

export async function handleStudentPortal(
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
  if (user.role !== "student")
    return json({ message: "Forbidden" }, 403);

  const db = getDb();
  const studentId = user.student_id as number;
  const classId = user.class_id as number;
  const sectionId = user.section_id as number;
  const schoolId = user.school_id as number;

  // ── GET /student-portal/attendance ───────────────────────────
  if (path === "/student-portal/attendance" && method === "GET") {
    try {
      const month = parseInt(url.searchParams.get("month") || String(new Date().getMonth() + 1));
      const year = parseInt(url.searchParams.get("year") || String(new Date().getFullYear()));

      const from = `${year}-${String(month).padStart(2, "0")}-01`;
      const to = new Date(year, month, 0).toISOString().slice(0, 10);

      const { data: records } = await db
        .from("student_attendance")
        .select("date, status")
        .eq("student_id", studentId)
        .gte("date", from)
        .lte("date", to)
        .order("date");

      const stats = { total: 0, present: 0, absent: 0, leave: 0 };
      for (const r of records || []) {
        const rec = r as Record<string, unknown>;
        stats.total++;
        const s = rec.status as keyof typeof stats;
        if (s in stats) stats[s]++;
      }

      return json({ records: records || [], stats });
    } catch (err) {
      console.error("[student-portal/attendance]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /student-portal/leaves ───────────────────────────────
  if (path === "/student-portal/leaves" && method === "GET") {
    try {
      const { data: leaves } = await db
        .from("leave_applications")
        .select("id, group_id, date, reason, status, withdrawal_status, applied_at")
        .eq("student_id", studentId)
        .order("applied_at", { ascending: false });

      const grouped: Record<string, unknown> = {};
      for (const row of leaves || []) {
        const r = row as Record<string, unknown>;
        const gid = r.group_id as string;
        if (!grouped[gid]) {
          grouped[gid] = {
            group_id: gid,
            reason: r.reason,
            status: r.status,
            withdrawal_status: r.withdrawal_status,
            dates: [],
            applied_at: r.applied_at,
          };
        }
        (grouped[gid] as Record<string, unknown[]>).dates.push(r.date as string);
        const priority: Record<string, number> = { rejected: 0, approved: 1, pending: 2 };
        const cur = (grouped[gid] as Record<string, unknown>).status as string;
        const next = r.status as string;
        if (priority[next] < priority[cur]) {
          (grouped[gid] as Record<string, unknown>).status = next;
        }
      }

      return json(Object.values(grouped));
    } catch (err) {
      console.error("[student-portal/leaves GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /student-portal/leaves ──────────────────────────────
  if (path === "/student-portal/leaves" && method === "POST") {
    try {
      const { dates, reason } = await req.json();
      if (!Array.isArray(dates) || !dates.length || !reason)
        return json({ message: "dates[] and reason are required" }, 400);

      const groupId = crypto.randomUUID();
      const rows = [];
      for (const date of dates) {
        const { data: existing } = await db
          .from("leave_applications")
          .select("id")
          .eq("student_id", studentId)
          .eq("date", date);
        if (!existing?.length) {
          rows.push({ group_id: groupId, student_id: studentId, date, reason, status: "pending" });
        }
      }

      if (!rows.length)
        return json({ message: "All selected dates already have leave applications" }, 409);

      const { data: inserted } = await db.from("leave_applications").insert(rows).select();

      // Push to teachers and admins (non-blocking)
      Promise.all([
        tokensForClassTeachers(db, classId, sectionId),
        tokensForSchoolAdmins(db, schoolId),
      ]).then(([tchTokens, admTokens]) => {
        const tokens = [...new Set([...tchTokens, ...admTokens])];
        sendPush(tokens, "New Leave Request", `${user.first_name} ${user.last_name} has applied for leave.`, {
          type: "leave_request",
        });
      });

      return json({
        message: "Leave application submitted",
        group_id: groupId,
        inserted: inserted?.length || 0,
      }, 201);
    } catch (err) {
      console.error("[student-portal/leaves POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT /student-portal/leaves/group/:id/withdraw ────────────
  const withdrawMatch = path.match(/^\/student-portal\/leaves\/group\/([^/]+)\/withdraw$/);
  if (withdrawMatch && method === "PUT") {
    const groupId = withdrawMatch[1];
    try {
      const { data: leaves } = await db
        .from("leave_applications")
        .select("id, status, withdrawal_status")
        .eq("group_id", groupId)
        .eq("student_id", studentId);

      if (!leaves?.length)
        return json({ message: "Leave group not found" }, 404);

      const anyPendingWithdrawal = (leaves as Record<string, unknown>[]).some(
        (l) => l.withdrawal_status === "pending",
      );
      if (anyPendingWithdrawal)
        return json({ message: "Withdrawal already pending" }, 409);

      await db
        .from("leave_applications")
        .update({ withdrawal_status: "pending" })
        .eq("group_id", groupId)
        .eq("student_id", studentId);

      return json({ message: "Withdrawal requested" });
    } catch (err) {
      console.error("[student-portal/leaves/withdraw]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}

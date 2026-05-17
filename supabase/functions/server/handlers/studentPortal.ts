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

  if (path === "/student-portal/profile" && method === "GET") {
    try {
      const { data: student } = await db
        .from("students")
        .select("id, first_name, last_name, age, roll_no, class_id, section_id, school_id")
        .eq("id", studentId)
        .maybeSingle();

      if (!student)
        return json({ message: "Student not found" }, 404);

      const typedStudent = student as Record<string, unknown>;
      const currentClassId = typedStudent.class_id as number | null;
      const currentSectionId = typedStudent.section_id as number | null;
      const currentSchoolId = (typedStudent.school_id as number | null) ?? schoolId;

      const [{ data: classRow }, { data: sectionRow }, { data: schoolRow }] = await Promise.all([
        currentClassId
          ? db.from("classes").select("id, class_name").eq("id", currentClassId).maybeSingle()
          : Promise.resolve({ data: null }),
        currentSectionId
          ? db.from("sections").select("id, section_name").eq("id", currentSectionId).maybeSingle()
          : Promise.resolve({ data: null }),
        currentSchoolId
          ? db.from("schools").select("id, name, logo_url, city, address, phone").eq("id", currentSchoolId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const { data: teacherAssignments } = currentClassId
        ? await db
            .from("teacher_classes")
            .select("teacher_id, class_id, section_id")
            .eq("class_id", currentClassId)
        : { data: [] as Record<string, unknown>[] };

      const matchingAssignments = (teacherAssignments || []).filter((assignment: Record<string, unknown>) =>
        Number(assignment.class_id) === Number(currentClassId)
        && (
          assignment.section_id == null
          || Number(assignment.section_id) === Number(currentSectionId)
        )
      );

      const teacherIds = Array.from(new Set(
        matchingAssignments
          .map((assignment: Record<string, unknown>) => Number(assignment.teacher_id))
          .filter(Boolean),
      ));

      const { data: matchingTeachersData } = teacherIds.length
        ? await db.from("teachers").select("id, first_name, last_name, teacher_role").in("id", teacherIds)
        : { data: [] as Record<string, unknown>[] };

      const matchingTeachers = (matchingTeachersData || [])
        .filter((teacher: Record<string, unknown>) => teacher.teacher_role === "class_teacher")
        .sort((left: Record<string, unknown>, right: Record<string, unknown>) => {
          const leftPriority = left.teacher_role === "class_teacher" ? 0 : 1;
          const rightPriority = right.teacher_role === "class_teacher" ? 0 : 1;
          if (leftPriority !== rightPriority) return leftPriority - rightPriority;
          return String(left.last_name || "").localeCompare(String(right.last_name || ""));
        });

      const teacherNames = matchingTeachers
        .map((teacher: Record<string, unknown>) => [teacher.first_name, teacher.last_name].filter(Boolean).join(" "))
        .filter(Boolean);

      return json({
        student_id: typedStudent.id,
        first_name: typedStudent.first_name,
        last_name: typedStudent.last_name,
        age: typedStudent.age,
        roll_no: typedStudent.roll_no,
        class_id: currentClassId,
        section_id: currentSectionId,
        school_id: currentSchoolId,
        class_name: (classRow as Record<string, unknown> | null)?.class_name || null,
        section_name: (sectionRow as Record<string, unknown> | null)?.section_name || null,
        school_name: (schoolRow as Record<string, unknown> | null)?.name || null,
        campus_name: (schoolRow as Record<string, unknown> | null)?.name || null,
        school_logo_url: (schoolRow as Record<string, unknown> | null)?.logo_url || null,
        campus_image_url: (schoolRow as Record<string, unknown> | null)?.logo_url || null,
        school_city: (schoolRow as Record<string, unknown> | null)?.city || null,
        school_address: (schoolRow as Record<string, unknown> | null)?.address || null,
        school_phone: (schoolRow as Record<string, unknown> | null)?.phone || null,
        teacher_names: teacherNames,
        primary_teacher_name: teacherNames[0] || null,
      });
    } catch (err) {
      console.error("[student-portal/profile]", err);
      return json({ message: "Server error" }, 500);
    }
  }

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

// handlers/parents.ts — parent portal, campus-scoped management by admins
import {
  json,
  getDb,
  SUPABASE_URL,
  verifyToken,
  verifyTokenString,
  hashPassword,
  comparePassword,
  signJwt,
  sendPush,
  tokensForClassTeachers,
  tokensForSchoolAdmins,
} from "../_shared.ts";

export async function handleParent(
  req: Request,
  path: string,
  url: URL,
): Promise<Response> {
  const method = req.method;
  const db = getDb();

  // POST /parent/login
  if (path === "/parent/login" && method === "POST") {
    try {
      const { email, password } = await req.json();
      if (!email || !password)
        return json({ message: "Email and password are required" }, 400);


      const lookupEmail = email.trim().toLowerCase();
      const { data: parent, error } = await db
        .from("parents")
        .select("id, email, first_name, last_name, school_id, password")
        .eq("email", lookupEmail)
        .single();

      if (error || !parent)
        return json({ message: "Invalid credentials" }, 401);

      if (!(await comparePassword(password, parent.password)))
        return json({ message: "Invalid credentials" }, 401);

      const token = await signJwt({
        id: parent.id,
        email: parent.email,
        role: "parent",
        school_id: parent.school_id,
      });

      return json({ message: "Login successful", id: parent.id,
        email: parent.email, first_name: parent.first_name,
        last_name: parent.last_name, school_id: parent.school_id, token }, 200);
    } catch (err) {
      console.error("[parent/login]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // All routes below require a valid parent JWT in X-User-Token
  let parentUser: Record<string, unknown>;
  try { parentUser = await verifyToken(req); } catch { return json({ message: "Unauthorized" }, 401); }
  if (!parentUser || parentUser.role !== "parent") return json({ message: "Unauthorized" }, 401);

  // GET /parent/dashboard
  if (path === "/parent/dashboard" && method === "GET") {
    try {
      const user = parentUser;
      const { data: children, error } = await db
        .from("parent_student")
        .select("student_id, relationship, students(id, first_name, last_name, age, class_id, section_id, roll_no, school_id)")
        .eq("parent_id", user.id);

      if (error) throw error;
      const classIds = Array.from(new Set((children || []).map((ps: any) => ps.students?.class_id).filter(Boolean)));
      const sectionIds = Array.from(new Set((children || []).map((ps: any) => ps.students?.section_id).filter(Boolean)));
      const schoolIds = Array.from(new Set((children || []).map((ps: any) => ps.students?.school_id).filter(Boolean)));

      const [{ data: classes }, { data: sections }, { data: schools }] = await Promise.all([
        classIds.length ? db.from("classes").select("id, class_name").in("id", classIds) : Promise.resolve({ data: [] as any[] }),
        sectionIds.length ? db.from("sections").select("id, section_name").in("id", sectionIds) : Promise.resolve({ data: [] as any[] }),
        schoolIds.length ? db.from("schools").select("id, name, logo_url").in("id", schoolIds) : Promise.resolve({ data: [] as any[] }),
      ]);

      const classMap = Object.fromEntries((classes || []).map((c: any) => [c.id, c.class_name]));
      const sectionMap = Object.fromEntries((sections || []).map((s: any) => [s.id, s.section_name]));
      const schoolMap = Object.fromEntries((schools || []).map((s: any) => [s.id, s]));

      return json({ children: (children || []).map((ps: any) => ({
        student_id: ps.student_id,
        first_name: ps.students?.first_name,
        last_name: ps.students?.last_name,
        age: ps.students?.age,
        class_id: ps.students?.class_id,
        section_id: ps.students?.section_id,
        class_name: ps.students?.class_id ? classMap[ps.students.class_id] : null,
        section_name: ps.students?.section_id ? sectionMap[ps.students.section_id] : null,
        roll_no: ps.students?.roll_no,
        school_name: ps.students?.school_id ? schoolMap[ps.students.school_id]?.name : null,
        school_logo_url: ps.students?.school_id ? schoolMap[ps.students.school_id]?.logo_url : null,
        relationship: ps.relationship,
      })) }, 200);
    } catch (err) {
      console.error("[parent/dashboard]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // POST /parent/children/link
  if (path === "/parent/children/link" && method === "POST") {
    try {
      const user = parentUser;

      const { student_id, relationship } = await req.json();
      if (!student_id) return json({ message: "student_id required" }, 400);

      const { data: student } = await db.from("students").select("id")
        .eq("id", student_id).eq("school_id", user.school_id).single();
      if (!student) return json({ message: "Student not found in your school" }, 404);

      const { data: existing } = await db.from("parent_student").select("id")
        .eq("parent_id", user.id).eq("student_id", student_id).single();
      if (existing) return json({ message: "Child already linked" }, 409);

      // A student can only be linked to one parent
      const { data: otherLink } = await db.from("parent_student")
        .select("parent_id").eq("student_id", student_id).neq("parent_id", user.id as number).maybeSingle();
      if (otherLink) return json({ message: "This student is already linked to another parent" }, 409);

      const { data: link, error } = await db.from("parent_student")
        .insert({ parent_id: user.id, student_id, relationship: relationship || "parent", verified: true })
        .select().single();
      if (error) throw error;
      return json({ message: "Child linked successfully", link }, 201);
    } catch (err) {
      console.error("[parent/children/link]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // GET /parent/children/:studentId/attendance
  if (path.match(/^\/parent\/children\/\d+\/attendance$/) && method === "GET") {
    try {
      const user = parentUser;
      const studentId = parseInt(path.split("/")[3]);
      const { data: link } = await db.from("parent_student").select("id")
        .eq("parent_id", user.id).eq("student_id", studentId).single();
      if (!link) return json({ message: "Access denied" }, 403);
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
        const s = (r as any).status;
        stats.total++;
        if (s === "present") stats.present++;
        else if (s === "absent") stats.absent++;
        else if (s === "leave") stats.leave++;
      }

      return json({ records: records || [], stats }, 200);
    } catch (err) {
      console.error("[parent/children/attendance]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path.match(/^\/parent\/children\/\d+\/profile$/) && method === "GET") {
    try {
      const user = parentUser;
      const studentId = parseInt(path.split("/")[3]);
      const { data: link } = await db.from("parent_student").select("relationship")
        .eq("parent_id", user.id).eq("student_id", studentId).maybeSingle();
      if (!link) return json({ message: "Access denied" }, 403);

      const { data: student } = await db
        .from("students")
        .select("id, first_name, last_name, age, roll_no, class_id, section_id, school_id")
        .eq("id", studentId)
        .maybeSingle();
      if (!student) return json({ message: "Student not found" }, 404);

      const typedStudent = student as Record<string, unknown>;
      const currentClassId = typedStudent.class_id as number | null;
      const currentSectionId = typedStudent.section_id as number | null;
      const currentSchoolId = (typedStudent.school_id as number | null) ?? (user.school_id as number | null);

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
        relationship: (link as Record<string, unknown>)?.relationship || null,
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
      }, 200);
    } catch (err) {
      console.error("[parent/children/profile]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // GET /parent/children/:studentId/lectures
  if (path.match(/^\/parent\/children\/\d+\/lectures$/) && method === "GET") {
    try {
      const user = parentUser;
      const studentId = parseInt(path.split("/")[3]);
      const { data: link } = await db.from("parent_student").select("id")
        .eq("parent_id", user.id).eq("student_id", studentId).single();
      if (!link) return json({ message: "Access denied" }, 403);
      const { data: student } = await db
        .from("students")
        .select("class_id, section_id, school_id")
        .eq("id", studentId)
        .single();
      if (!student) return json({ message: "Student not found" }, 404);

      const { data: lectures } = await db
        .from("lectures")
        .select(`id, teacher_id, subject_name, lecture_name, type, date, file_path, message, uploaded_by, created_at, class_id, section_id,
                 classes!inner(class_name), sections(section_name)`)
        .eq("school_id", (student as any).school_id)
        .eq("class_id", (student as any).class_id)
        .or(`section_id.eq.${(student as any).section_id},section_id.is.null`)
        .order("date", { ascending: false });

      const result = (lectures || []).map((l: any) => ({
        ...l,
        class_name: l.classes?.class_name,
        section_name: l.section_id ? l.sections?.section_name : "All Sections",
        file_url: l.file_path
          ? `${SUPABASE_URL()}/storage/v1/object/public/lectures/${l.file_path}`
          : null,
      }));
      return json({ lectures: result }, 200);
    } catch (err) {
      console.error("[parent/children/lectures]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // GET /parent/children/:studentId/notifications
  if (path.match(/^\/parent\/children\/\d+\/notifications$/) && method === "GET") {
    try {
      const user = parentUser;
      const studentId = parseInt(path.split("/")[3]);
      const { data: link } = await db.from("parent_student").select("id")
        .eq("parent_id", user.id).eq("student_id", studentId).single();
      if (!link) return json({ message: "Access denied" }, 403);
      const { data: student } = await db
        .from("students")
        .select("id, class_id, section_id, school_id")
        .eq("id", studentId)
        .single();
      if (!student) return json({ message: "Student not found" }, 404);

      const classId = (student as any).class_id;
      const sectionId = (student as any).section_id;
      const studentSchoolId = (student as any).school_id;

      const { data: notifs } = await db
        .from("notifications")
        .select("*")
        .eq("school_id", studentSchoolId)
        .or(
          `target_type.eq.school,` +
          `and(target_type.eq.class,class_id.eq.${classId}),` +
          `and(target_type.eq.section,class_id.eq.${classId},section_id.eq.${sectionId}),` +
          `and(target_type.eq.student,student_id.eq.${studentId})`,
        )
        .order("created_at", { ascending: false });

      const notifIds = (notifs || []).map((n: any) => n.id);
      const { data: reads } = notifIds.length
        ? await db
            .from("notification_reads")
            .select("notification_id")
            .eq("student_id", studentId)
            .in("notification_id", notifIds)
        : { data: [] as any[] };

      const readSet = new Set((reads || []).map((r: any) => r.notification_id));
      const notifications = (notifs || []).map((n: any) => ({ ...n, is_read: readSet.has(n.id) }));
      return json({ notifications }, 200);
    } catch (err) {
      console.error("[parent/children/notifications]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // POST /parent/children/:studentId/notifications/:notifId/read
  const parentNotifReadMatch = path.match(/^\/parent\/children\/(\d+)\/notifications\/(\d+)\/read$/);
  if (parentNotifReadMatch && method === "POST") {
    try {
      const user = parentUser;

      const studentId = parseInt(parentNotifReadMatch[1]);
      const notifId = parseInt(parentNotifReadMatch[2]);

      const { data: link } = await db.from("parent_student").select("id")
        .eq("parent_id", user.id).eq("student_id", studentId).single();
      if (!link) return json({ message: "Access denied" }, 403);

      await db.from("notification_reads").upsert(
        { notification_id: notifId, student_id: studentId },
        { onConflict: "notification_id,student_id" },
      );

      return json({ message: "Marked as read" }, 200);
    } catch (err) {
      console.error("[parent/children/notifications/read]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // GET /parent/children/:studentId/leaves
  if (path.match(/^\/parent\/children\/\d+\/leaves$/) && method === "GET") {
    try {
      const user = parentUser;
      const studentId = parseInt(path.split("/")[3]);
      const { data: link } = await db.from("parent_student").select("id")
        .eq("parent_id", user.id).eq("student_id", studentId).single();
      if (!link) return json({ message: "Access denied" }, 403);
      const { data: leaves } = await db
        .from("leave_applications")
        .select("id, group_id, date, reason, status, withdrawal_status, applied_at")
        .eq("student_id", studentId)
        .order("applied_at", { ascending: false });

      const grouped: Record<string, any> = {};
      for (const row of leaves || []) {
        const gid = String((row as any).group_id || (row as any).id);
        if (!grouped[gid]) {
          grouped[gid] = {
            group_id: gid,
            reason: (row as any).reason,
            status: (row as any).status,
            withdrawal_status: (row as any).withdrawal_status,
            dates: [],
            applied_at: (row as any).applied_at,
          };
        }
        grouped[gid].dates.push((row as any).date);
        const priority: Record<string, number> = { rejected: 0, approved: 1, pending: 2 };
        const cur = grouped[gid].status;
        const next = (row as any).status;
        if ((priority[next] ?? 99) < (priority[cur] ?? 99)) grouped[gid].status = next;
      }
      return json({ leaves: Object.values(grouped) }, 200);
    } catch (err) {
      console.error("[parent/children/leaves]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // POST /parent/children/:studentId/leaves
  if (path.match(/^\/parent\/children\/\d+\/leaves$/) && method === "POST") {
    try {
      const user = parentUser;

      const studentId = parseInt(path.split("/")[3]);
      const { data: link } = await db.from("parent_student").select("id")
        .eq("parent_id", user.id).eq("student_id", studentId).single();
      if (!link) return json({ message: "Access denied" }, 403);

      const { dates, reason } = await req.json();
      if (!Array.isArray(dates) || !dates.length || !reason)
        return json({ message: "dates[] and reason are required" }, 400);

      const { data: student } = await db
        .from("students")
        .select("id, first_name, last_name, class_id, section_id, school_id")
        .eq("id", studentId)
        .single();
      if (!student) return json({ message: "Student not found" }, 404);

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

      Promise.all([
        tokensForClassTeachers(db, (student as any).class_id as number, (student as any).section_id as number),
        tokensForSchoolAdmins(db, (student as any).school_id as number),
      ]).then(([tchTokens, admTokens]) => {
        const tokens = [...new Set([...tchTokens, ...admTokens])];
        sendPush(
          tokens,
          "New Leave Request",
          `${(student as any).first_name} ${(student as any).last_name} has applied for leave.`,
          { type: "leave_request" },
        );
      });

      return json({
        message: "Leave application submitted",
        group_id: groupId,
        inserted: inserted?.length || 0,
      }, 201);
    } catch (err) {
      console.error("[parent/children/leaves POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // PUT /parent/children/:studentId/leaves/group/:id/withdraw
  const parentWithdrawMatch = path.match(/^\/parent\/children\/(\d+)\/leaves\/group\/([^/]+)\/withdraw$/);
  if (parentWithdrawMatch && method === "PUT") {
    try {
      const user = parentUser;

      const studentId = parseInt(parentWithdrawMatch[1]);
      const groupId = parentWithdrawMatch[2];

      const { data: link } = await db.from("parent_student").select("id")
        .eq("parent_id", user.id).eq("student_id", studentId).single();
      if (!link) return json({ message: "Access denied" }, 403);

      const { data: leaves } = await db
        .from("leave_applications")
        .select("id, status, withdrawal_status, date")
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

      // Notify teacher and admin of withdrawal request
      const { data: student } = await db
        .from("students")
        .select("first_name, last_name, school_id")
        .eq("id", studentId)
        .single();
      
      if (student) {
        const studentName = `${student.first_name} ${student.last_name}`;
        const firstLeave = (leaves as Record<string, unknown>[])[0];
        const dateLabel = firstLeave?.date ? new Date(firstLeave.date as string).toLocaleDateString() : "N/A";
        
        // Send push notification to teachers and admins
        Promise.all([
          tokensForClassTeachers(db, studentId),
          tokensForSchoolAdmins(db, student.school_id),
        ]).then(([teacherTokens, adminTokens]) => {
          const allTokens = [...new Set([...teacherTokens, ...adminTokens])];
          sendPush(allTokens, "Leave Withdrawal Request", `${studentName} requested to withdraw leave on ${dateLabel}.`, { type: "withdrawal_request", group_id: groupId });
        }).catch(() => {});
      }

      return json({ message: "Withdrawal requested" }, 200);
    } catch (err) {
      console.error("[parent/children/leaves/withdraw]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}

// ADMIN PARENT MANAGEMENT
export async function handleAdminParents(
  req: Request,
  path: string,
  url: URL,
): Promise<Response> {
  const method = req.method;
  const db = getDb();

  try {
    let adminUser: Record<string, unknown>;
    try { adminUser = await verifyToken(req); } catch { return json({ message: "Unauthorized" }, 401); }
    if (!adminUser || adminUser.role !== "admin")
      return json({ message: "Unauthorized" }, 401);

    const mySchoolId = adminUser.school_id as number;

    // Helper: collect all parent IDs accessible to this admin campus
    const accessibleIds = async (): Promise<number[]> => {
      // Get students in this school to find parents by child link
      const { data: schoolStudents } = await db.from("students").select("id").eq("school_id", mySchoolId);
      const studentIds = (schoolStudents || []).map((s: any) => s.id as number);

      const [{ data: direct }, { data: access }, { data: byChild }] = await Promise.all([
        db.from("parents").select("id").eq("school_id", mySchoolId),
        db.from("parent_school_access").select("parent_id").eq("school_id", mySchoolId),
        studentIds.length
          ? db.from("parent_student").select("parent_id").in("student_id", studentIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      return [...new Set([
        ...(direct || []).map((p: any) => p.id as number),
        ...(access || []).map((r: any) => r.parent_id as number),
        ...(byChild || []).map((r: any) => r.parent_id as number),
      ])];
    };

    // Helper: is a specific parent accessible to this admin campus?
    const canAccessParent = async (parentId: number): Promise<boolean> => {
      const { data: schoolStudents } = await db.from("students").select("id").eq("school_id", mySchoolId);
      const studentIds = (schoolStudents || []).map((s: any) => s.id as number);

      const [{ data: direct }, { data: access }, { data: byChild }] = await Promise.all([
        db.from("parents").select("id").eq("id", parentId).eq("school_id", mySchoolId).maybeSingle(),
        db.from("parent_school_access").select("parent_id").eq("parent_id", parentId).eq("school_id", mySchoolId).maybeSingle(),
        studentIds.length
          ? db.from("parent_student").select("parent_id").eq("parent_id", parentId).in("student_id", studentIds).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return !!(direct || access || byChild);
    };

    // GET /admin/parents
    if (path === "/admin/parents" && method === "GET") {
      const ids = await accessibleIds();
      if (!ids.length) return json({ parents: [] }, 200);
      const { data: parents, error } = await db.from("parents")
        .select("id, email, first_name, last_name, phone, school_id, created_at")
        .in("id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ parents: parents || [] }, 200);
    }

    // POST /admin/parents/link-existing — link an existing parent (from any campus) to this campus
    if (path === "/admin/parents/link-existing" && method === "POST") {
      const { email } = await req.json();
      if (!email) return json({ message: "email is required" }, 400);
      const { data: parent } = await db.from("parents").select("id, email, first_name, last_name, phone, school_id")
        .eq("email", email.trim().toLowerCase()).maybeSingle();
      if (!parent) return json({ message: "No parent account found with that email" }, 404);
      // Already accessible?
      if (await canAccessParent((parent as any).id)) return json({ message: "Parent already in your campus", parent }, 200);
      const { error } = await db.from("parent_school_access")
        .insert({ parent_id: (parent as any).id, school_id: mySchoolId });
      if (error && error.code !== "23505") throw error;
      return json({ message: "Parent linked to your campus", parent }, 200);
    }

    // POST /admin/parents
    if (path === "/admin/parents" && method === "POST") {
      const { email, password, first_name, last_name, phone } = await req.json();
      if (!email || !password)
        return json({ message: "Email and password are required" }, 400);
      const hashed = await hashPassword(password);
      const { data: parent, error } = await db.from("parents")
        .insert({
          email: email.trim().toLowerCase(), password: hashed,
          first_name: first_name || null, last_name: last_name || null,
          phone: phone || null, school_id: mySchoolId,
        }).select().single();
      if (error) {
        if (error.code === "23505")
          return json({ message: "Email already exists" }, 409);
        throw error;
      }
      // Register access in junction table
      await db.from("parent_school_access")
        .insert({ parent_id: parent.id, school_id: mySchoolId })
        .then(() => {}).catch(() => {});
      return json({ message: "Parent account created",
        parent: { id: parent.id, email: parent.email, first_name: parent.first_name,
          last_name: parent.last_name, phone: parent.phone } }, 201);
    }

    // PUT /admin/parents/:id
    if (path.match(/^\/admin\/parents\/\d+$/) && method === "PUT") {
      const parentId = parseInt(path.split("/")[3]);
      if (!(await canAccessParent(parentId))) return json({ message: "Parent not found" }, 404);
      const { email, first_name, last_name, phone, password } = await req.json();
      const upd: any = {};
      if (email) {
        const trimmed = email.trim().toLowerCase();
        const { data: dup } = await db.from("parents").select("id")
          .eq("email", trimmed).neq("id", parentId).maybeSingle();
        if (dup) return json({ message: "Email already in use by another parent" }, 409);
        upd.email = trimmed;
      }
      if (first_name !== undefined) upd.first_name = first_name;
      if (last_name !== undefined) upd.last_name = last_name;
      if (phone !== undefined) upd.phone = phone;
      if (password) {
        // Only the admin who originally created the parent account can change the password
        const { data: parentRow } = await db.from("parents").select("school_id").eq("id", parentId).single();
        if (!parentRow || (parentRow as any).school_id !== mySchoolId)
          return json({ message: "Only the admin who created this parent account can change the password" }, 403);
        upd.password = await hashPassword(password);
      }
      const { data: updated, error } = await db.from("parents")
        .update(upd).eq("id", parentId).select().single();
      if (error) throw error;
      return json({ message: "Parent updated",
        parent: { id: updated.id, email: updated.email, first_name: updated.first_name,
          last_name: updated.last_name, phone: updated.phone } }, 200);
    }

    // DELETE /admin/parents/:id
    if (path.match(/^\/admin\/parents\/\d+$/) && method === "DELETE") {
      const parentId = parseInt(path.split("/")[3]);
      if (!(await canAccessParent(parentId))) return json({ message: "Parent not found" }, 404);

      // Remove this campus's access link
      await db.from("parent_school_access").delete()
        .eq("parent_id", parentId).eq("school_id", mySchoolId);

      // Only org_admin or super_admin can delete the parent row itself
      if (adminUser.role === "org_admin" || adminUser.role === "super_admin") {
        // Check if parent still has other campus associations
        const { data: otherAccess } = await db.from("parent_school_access")
          .select("parent_id").eq("parent_id", parentId).limit(1);
        if (!otherAccess?.length) {
          await db.from("parents").delete().eq("id", parentId);
          return json({ message: "Parent deleted" }, 200);
        }
      }
      // For regular admins, or if parent still mapped elsewhere, just confirm removal
      return json({ message: "Parent unmapped from campus" }, 200);
    }

    // GET /admin/parents/:id/children
    if (path.match(/^\/admin\/parents\/\d+\/children$/) && method === "GET") {
      const parentId = parseInt(path.split("/")[3]);
      if (!(await canAccessParent(parentId))) return json({ message: "Parent not found" }, 404);
      const { data: children, error } = await db.from("parent_student")
        .select("student_id, relationship, students(id, first_name, last_name, school_id)")
        .eq("parent_id", parentId);
      if (error) throw error;
      return json({ children: (children || []).map((c: any) => ({
        student_id: c.student_id, first_name: c.students?.first_name,
        last_name: c.students?.last_name, relationship: c.relationship,
        school_id: c.students?.school_id,
      })) }, 200);
    }

    // POST /admin/parents/:id/link-child
    if (path.match(/^\/admin\/parents\/\d+\/link-child$/) && method === "POST") {
      const parentId = parseInt(path.split("/")[3]);
      if (!(await canAccessParent(parentId))) return json({ message: "Parent not found" }, 404);
      const { student_id, relationship } = await req.json();
      if (!student_id) return json({ message: "student_id is required" }, 400);
      const { data: student } = await db.from("students").select("id, first_name, last_name")
        .eq("id", student_id).eq("school_id", mySchoolId).single();
      if (!student) return json({ message: "Student not found in this campus" }, 404);
      // A student can only be linked to one parent
      const { data: existingLink } = await db.from("parent_student")
        .select("parent_id").eq("student_id", student_id).neq("parent_id", parentId).maybeSingle();
      if (existingLink) return json({ message: "This student is already linked to another parent" }, 409);
      const { error } = await db.from("parent_student").upsert(
        { parent_id: parentId, student_id, relationship: relationship || null, verified: true },
        { onConflict: "parent_id,student_id" }
      );
      if (error) throw error;
      // Ensure parent has access to this campus
      await db.from("parent_school_access")
        .upsert({ parent_id: parentId, school_id: mySchoolId }, { onConflict: "parent_id,school_id" })
        .then(() => {}).catch(() => {});
      return json({ message: "Child linked", student: { id: student.id, first_name: student.first_name, last_name: student.last_name } }, 200);
    }

    // DELETE /admin/parents/:parentId/children/:studentId
    if (path.match(/^\/admin\/parents\/\d+\/children\/\d+$/) && method === "DELETE") {
      const parts = path.split("/");
      const parentId = parseInt(parts[3]);
      const studentId = parseInt(parts[5]);
      if (!(await canAccessParent(parentId))) return json({ message: "Parent not found" }, 404);
      // Only allow unlinking students that belong to this campus
      const { data: student } = await db.from("students").select("id").eq("id", studentId).eq("school_id", mySchoolId).maybeSingle();
      if (!student) return json({ message: "Student not in your campus" }, 403);
      const { error } = await db.from("parent_student")
        .delete().eq("parent_id", parentId).eq("student_id", studentId);
      if (error) throw error;
      return json({ message: "Child unlinked" }, 200);
    }

    return json({ message: "Not found" }, 404);
  } catch (err) {
    console.error("[admin/parents]", err);
    return json({ message: "Server error" }, 500);
  }
}
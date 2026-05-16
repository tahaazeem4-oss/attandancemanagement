// handlers/orgAdmin.ts — organization-level admin (sees all campuses in their org)
import {
  json,
  getDb,
  verifyToken,
  hashPassword,
  sendPush,
  SUPABASE_URL,
} from "../_shared.ts";
import * as XLSX from "npm:xlsx";

export async function handleOrgAdmin(
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
  if (user.role !== "org_admin" && user.role !== "super_admin")
    return json({ message: "Forbidden" }, 403);

  const db = getDb();
  const orgId = Number(user.org_id);

  if (!Number.isFinite(orgId)) {
    return json({ message: "Invalid organization scope" }, 403);
  }

  async function getCampusIds(): Promise<number[]> {
    const { data } = await db.from("schools").select("id").eq("org_id", orgId);
    return (data || []).map((s: Record<string, unknown>) => s.id as number);
  }

  async function verifyCampus(campusId: number): Promise<boolean> {
    const { data } = await db.from("schools").select("id").eq("id", campusId).eq("org_id", orgId).single();
    return !!data;
  }

  async function buildSchoolMap(campusIds: number[]): Promise<Record<number, string>> {
    const { data: schools } = await db.from("schools").select("id, name").in("id", campusIds);
    const map: Record<number, string> = {};
    for (const s of schools || []) {
      const r = s as Record<string, unknown>;
      map[r.id as number] = r.name as string;
    }
    return map;
  }

  const deriveRoleFromAssignments = (assignments: unknown[]): string => {
    const n = Array.isArray(assignments) ? assignments.length : 0;
    if (n === 0) return "subject_teacher";
    if (n === 1) return "class_teacher";
    return "floor_incharge";
  };

  const validateTeacherRoleAssignments = (
    _teacherRole: string,
    _assignments: unknown[],
  ): string | null => null;

  // ── GET /org-admin/stats ─────────────────────────────────────
  if (path === "/org-admin/stats" && method === "GET") {
    try {
      const campusIds = await getCampusIds();
      if (!campusIds.length)
        return json({ campuses: 0, teachers: 0, students: 0, classes: 0, pending_leaves: 0 });
      const [{ count: teachers }, { count: students }, { count: classes }] = await Promise.all([
        db.from("teachers").select("*", { count: "exact", head: true }).in("school_id", campusIds),
        db.from("students").select("*", { count: "exact", head: true }).in("school_id", campusIds),
        db.from("classes").select("*", { count: "exact", head: true }).in("school_id", campusIds),
      ]);
      const { data: leaveRows } = await db
        .from("leave_applications")
        .select("group_id, status, withdrawal_status, students!inner(school_id)")
        .in("students.school_id", campusIds);
      const pendingGroups = new Set<string>();
      for (const row of leaveRows || []) {
        const r = row as Record<string, unknown>;
        const gid = String(r.group_id ?? "");
        if (!gid) continue;
        if (r.status === "pending" || r.withdrawal_status === "pending") pendingGroups.add(gid);
      }
      return json({ campuses: campusIds.length, teachers, students, classes, pending_leaves: pendingGroups.size });
    } catch (err) {
      console.error("[org-admin/stats]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  CAMPUSES
  // ══════════════════════════════════════════════════════════════
  if (path === "/org-admin/campuses" && method === "GET") {
    try {
      const { data: campuses } = await db
        .from("schools")
        .select("id, name, tagline, initials, logo_url, primary_color, accent_color, created_at")
        .eq("org_id", orgId).order("name");
      const result = await Promise.all((campuses || []).map(async (c: Record<string, unknown>) => {
        const [{ count: teacher_count }, { count: student_count }, { count: class_count }] = await Promise.all([
          db.from("teachers").select("*", { count: "exact", head: true }).eq("school_id", c.id),
          db.from("students").select("*", { count: "exact", head: true }).eq("school_id", c.id),
          db.from("classes").select("*", { count: "exact", head: true }).eq("school_id", c.id),
        ]);
        return { ...c, teacher_count, student_count, class_count };
      }));
      return json(result);
    } catch (err) {
      console.error("[org-admin/campuses GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/org-admin/campuses" && method === "POST") {
    try {
      const { name, tagline, initials } = await req.json();
      if (!name?.trim()) return json({ message: "Campus name is required" }, 400);
      const { data, error } = await db.from("schools")
        .insert({ org_id: orgId, name: name.trim(), tagline: tagline || null, initials: initials?.toUpperCase() || null })
        .select().single();
      if (error) throw error;
      return json({ message: "Campus created", id: data.id }, 201);
    } catch (err) {
      console.error("[org-admin/campuses POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const campusMatch = path.match(/^\/org-admin\/campuses\/(\d+)$/);
  if (campusMatch && method === "PUT") {
    const id = parseInt(campusMatch[1]);
    if (!(await verifyCampus(id))) return json({ message: "Not found" }, 404);
    try {
      const { name, tagline, initials } = await req.json();
      await db.from("schools").update({ name, tagline: tagline || null, initials: initials?.toUpperCase() || null }).eq("id", id);
      return json({ message: "Campus updated" });
    } catch (err) {
      console.error("[org-admin/campuses PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (campusMatch && method === "DELETE") {
    const id = parseInt(campusMatch[1]);
    if (!(await verifyCampus(id))) return json({ message: "Not found" }, 404);
    try {
      await db.from("schools").delete().eq("id", id);
      return json({ message: "Campus deleted" });
    } catch (err) {
      console.error("[org-admin/campuses DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  ADMINS (campus-level)
  // ══════════════════════════════════════════════════════════════
  if (path === "/org-admin/admins" && method === "GET") {
    try {
      const campusId = url.searchParams.get("campus_id");
      const campusIds = campusId ? [parseInt(campusId)] : await getCampusIds();
      if (!campusIds.length) return json([]);
      const { data } = await db.from("admins")
        .select("id, first_name, last_name, email, school_id, created_at")
        .in("school_id", campusIds).order("last_name");
      const sMap = await buildSchoolMap(campusIds);
      return json((data || []).map((a: Record<string, unknown>) => ({ ...a, campus_name: sMap[a.school_id as number] || null })));
    } catch (err) {
      console.error("[org-admin/admins GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/org-admin/admins" && method === "POST") {
    try {
      const { first_name, last_name, email, password, school_id } = await req.json();
      if (!first_name || !last_name || !email || !password || !school_id)
        return json({ message: "Missing required fields" }, 400);
      if (!(await verifyCampus(school_id))) return json({ message: "Campus not in your org" }, 403);
      const hashed = await hashPassword(password);
      const { data, error } = await db.from("admins")
        .insert({ school_id, first_name: first_name.trim(), last_name: last_name.trim(), email: email.trim().toLowerCase(), password: hashed })
        .select().single();
      if (error) {
        if (error.code === "23505") return json({ message: "Email already exists" }, 409);
        throw error;
      }
      return json({ message: "Admin created", id: data.id }, 201);
    } catch (err) {
      console.error("[org-admin/admins POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const adminMatch = path.match(/^\/org-admin\/admins\/(\d+)$/);
  if (adminMatch && method === "PUT") {
    const id = parseInt(adminMatch[1]);
    try {
      const { first_name, last_name, email } = await req.json();
      const campusIds = await getCampusIds();
      await db.from("admins").update({ first_name, last_name, email: email?.trim().toLowerCase() }).eq("id", id).in("school_id", campusIds);
      return json({ message: "Admin updated" });
    } catch (err) {
      console.error("[org-admin/admins PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (adminMatch && method === "DELETE") {
    const id = parseInt(adminMatch[1]);
    try {
      const campusIds = await getCampusIds();
      await db.from("admins").delete().eq("id", id).in("school_id", campusIds);
      return json({ message: "Admin deleted" });
    } catch (err) {
      console.error("[org-admin/admins DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const adminResetMatch = path.match(/^\/org-admin\/admins\/(\d+)\/reset-password$/);
  if (adminResetMatch && method === "POST") {
    const id = parseInt(adminResetMatch[1]);
    try {
      const { new_password } = await req.json();
      if (!new_password) return json({ message: "new_password required" }, 400);
      const hashed = await hashPassword(new_password);
      const campusIds = await getCampusIds();
      await db.from("admins").update({ password: hashed }).eq("id", id).in("school_id", campusIds);
      return json({ message: "Password reset" });
    } catch (err) {
      console.error("[org-admin/admins/reset-password]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  TEACHERS
  // ══════════════════════════════════════════════════════════════
  if (path === "/org-admin/teachers" && method === "GET") {
    try {
      const campusId = url.searchParams.get("campus_id");
      const classId = url.searchParams.get("class_id");
      const sectionId = url.searchParams.get("section_id");
      const campusIds = campusId ? [parseInt(campusId)] : await getCampusIds();
      if (!campusIds.length) return json([]);
      const { data: teachers } = await db.from("teachers")
        .select("id, first_name, last_name, email, phone, school_id, created_at, teacher_role")
        .in("school_id", campusIds).order("last_name");

      const teacherIds = (teachers || []).map((t: Record<string, unknown>) => t.id as number);
      const { data: assignments } = teacherIds.length
        ? await db
          .from("teacher_classes")
          .select("teacher_id, class_id, section_id, classes!inner(class_name), sections!inner(section_name)")
          .in("teacher_id", teacherIds)
        : { data: [] };

      const assignMap: Record<number, unknown[]> = {};
      for (const a of assignments || []) {
        const r = a as Record<string, unknown>;
        const tid = r.teacher_id as number;
        if (!assignMap[tid]) assignMap[tid] = [];
        assignMap[tid].push({
          class_id: r.class_id,
          section_id: r.section_id,
          class_name: (r.classes as Record<string, unknown>).class_name,
          section_name: (r.sections as Record<string, unknown>).section_name,
        });
      }

      const sMap = await buildSchoolMap(campusIds);
      let result = (teachers || []).map((t: Record<string, unknown>) => ({
        ...t,
        assignments: assignMap[t.id as number] || [],
        teacher_role: (t.teacher_role as string) || deriveRoleFromAssignments(assignMap[t.id as number] || []),
        campus_name: sMap[t.school_id as number] || null,
      }));

      if (classId) {
        result = result.filter((t: Record<string, unknown>) =>
          (t.assignments as Record<string, unknown>[]).some(
            (a) => String(a.class_id) === classId && (!sectionId || String(a.section_id) === sectionId),
          )
        );
      }

      return json(result);
    } catch (err) {
      console.error("[org-admin/teachers GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/org-admin/teachers" && method === "POST") {
    try {
      const body = await req.json();
      const { first_name, last_name, email, password, phone, school_id, assignments } = body;
      if (!first_name || !last_name || !email || !password || !school_id)
        return json({ message: "Missing required fields" }, 400);
      if (!(await verifyCampus(school_id))) return json({ message: "Campus not in your org" }, 403);

      const normalizedAssignments = Array.isArray(assignments) ? assignments : [];
      const teacherRole = ["class_teacher", "floor_incharge", "subject_teacher"].includes(body.teacher_role)
        ? body.teacher_role
        : deriveRoleFromAssignments(normalizedAssignments);
      const roleValidationError = validateTeacherRoleAssignments(teacherRole, normalizedAssignments);
      if (roleValidationError) return json({ message: roleValidationError }, 400);

      const hashed = await hashPassword(password);
      const { data, error } = await db.from("teachers")
        .insert({
          school_id,
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          email: email.trim().toLowerCase(),
          password: hashed,
          phone: phone || null,
          teacher_role: teacherRole,
        })
        .select().single();
      if (error) {
        if (error.code === "23505") return json({ message: "Email already exists" }, 409);
        throw error;
      }

      if (normalizedAssignments.length) {
        await db.from("teacher_classes").insert(
          normalizedAssignments.map((a: Record<string, unknown>) => ({
            teacher_id: data.id,
            class_id: a.class_id,
            section_id: a.section_id,
          })),
        );
      }

      return json({ message: "Teacher created", id: data.id }, 201);
    } catch (err) {
      console.error("[org-admin/teachers POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const teacherMatch = path.match(/^\/org-admin\/teachers\/(\d+)$/);
  if (teacherMatch && method === "PUT") {
    const id = parseInt(teacherMatch[1]);
    try {
      const body = await req.json();
      const { first_name, last_name, email, phone, assignments } = body;
      const normalizedAssignments = Array.isArray(assignments) ? assignments : [];
      const teacherRole = ["class_teacher", "floor_incharge", "subject_teacher"].includes(body.teacher_role)
        ? body.teacher_role
        : deriveRoleFromAssignments(normalizedAssignments);
      const roleValidationError = validateTeacherRoleAssignments(teacherRole, normalizedAssignments);
      if (roleValidationError) return json({ message: roleValidationError }, 400);

      const campusIds = await getCampusIds();
      await db.from("teachers").update({
        first_name,
        last_name,
        email: email?.trim().toLowerCase(),
        phone: phone || null,
        teacher_role: teacherRole,
      }).eq("id", id).in("school_id", campusIds);

      await db.from("teacher_classes").delete().eq("teacher_id", id);
      if (normalizedAssignments.length) {
        await db.from("teacher_classes").insert(
          normalizedAssignments.map((a: Record<string, unknown>) => ({
            teacher_id: id,
            class_id: a.class_id,
            section_id: a.section_id,
          })),
        );
      }

      return json({ message: "Teacher updated" });
    } catch (err) {
      console.error("[org-admin/teachers PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (teacherMatch && method === "DELETE") {
    const id = parseInt(teacherMatch[1]);
    try {
      const campusIds = await getCampusIds();
      await db.from("teachers").delete().eq("id", id).in("school_id", campusIds);
      return json({ message: "Teacher deleted" });
    } catch (err) {
      console.error("[org-admin/teachers DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const teacherResetMatch = path.match(/^\/org-admin\/teachers\/(\d+)\/reset-password$/);
  if (teacherResetMatch && method === "POST") {
    const id = parseInt(teacherResetMatch[1]);
    try {
      const { new_password } = await req.json();
      if (!new_password) return json({ message: "new_password required" }, 400);
      const hashed = await hashPassword(new_password);
      const campusIds = await getCampusIds();
      await db.from("teachers").update({ password: hashed }).eq("id", id).in("school_id", campusIds);
      return json({ message: "Password reset" });
    } catch (err) {
      console.error("[org-admin/teachers/reset-password]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  STUDENTS
  // ══════════════════════════════════════════════════════════════
  if (path === "/org-admin/students" && method === "GET") {
    try {
      const campusId = url.searchParams.get("campus_id");
      const classId  = url.searchParams.get("class_id");
      const sectionId = url.searchParams.get("section_id");
      const campusIds = campusId ? [parseInt(campusId)] : await getCampusIds();
      if (!campusIds.length) return json([]);
      let q = db.from("students")
        .select(`id, first_name, last_name, age, roll_no, school_id, class_id, section_id,
                 classes!inner(class_name), sections!inner(section_name)`)
        .in("school_id", campusIds).order("last_name");
      if (classId) q = q.eq("class_id", classId);
      if (sectionId) q = q.eq("section_id", sectionId);
      const { data: students } = await q;
      const sMap = await buildSchoolMap(campusIds);
      return json((students || []).map((s: Record<string, unknown>) => ({
        ...s,
        class_name: (s.classes as Record<string, unknown>)?.class_name,
        section_name: (s.sections as Record<string, unknown>)?.section_name,
        campus_name: sMap[s.school_id as number] || null,
      })));
    } catch (err) {
      console.error("[org-admin/students GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/org-admin/students" && method === "POST") {
    try {
      const body = await req.json();
      if (!body.school_id) return json({ message: "school_id required" }, 400);
      if (!(await verifyCampus(body.school_id))) return json({ message: "Campus not in your org" }, 403);
      const { data, error } = await db.from("students").insert({ ...body, roll_no: body.roll_no || null }).select().single();
      if (error) throw error;
      return json({ message: "Student created", id: data.id }, 201);
    } catch (err) {
      console.error("[org-admin/students POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const studentMatch = path.match(/^\/org-admin\/students\/(\d+)$/);
  if (studentMatch && method === "PUT") {
    const id = parseInt(studentMatch[1]);
    try {
      const body = await req.json();
      const campusIds = await getCampusIds();
      await db.from("students").update({ ...body, roll_no: body.roll_no || null }).eq("id", id).in("school_id", campusIds);
      return json({ message: "Student updated" });
    } catch (err) {
      console.error("[org-admin/students PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (studentMatch && method === "DELETE") {
    const id = parseInt(studentMatch[1]);
    try {
      const campusIds = await getCampusIds();
      await db.from("students").delete().eq("id", id).in("school_id", campusIds);
      return json({ message: "Student deleted" });
    } catch (err) {
      console.error("[org-admin/students DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  CLASSES & SECTIONS
  // ══════════════════════════════════════════════════════════════
  if (path === "/org-admin/classes" && method === "GET") {
    try {
      const campusId = url.searchParams.get("campus_id");
      const campusIds = campusId ? [parseInt(campusId)] : await getCampusIds();
      if (!campusIds.length) return json([]);
      const { data } = await db.from("classes")
        .select("id, class_name, school_id, sections(id, section_name)")
        .in("school_id", campusIds).order("class_name");
      const sMap = await buildSchoolMap(campusIds);
      return json((data || []).map((c: Record<string, unknown>) => ({ ...c, campus_name: sMap[c.school_id as number] || null })));
    } catch (err) {
      console.error("[org-admin/classes GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/org-admin/classes" && method === "POST") {
    try {
      const { class_name, school_id } = await req.json();
      if (!class_name || !school_id) return json({ message: "class_name and school_id required" }, 400);
      if (!(await verifyCampus(school_id))) return json({ message: "Campus not in your org" }, 403);
      const { data, error } = await db.from("classes").insert({ school_id, class_name }).select().single();
      if (error) throw error;
      return json({ message: "Class created", id: data.id }, 201);
    } catch (err) {
      console.error("[org-admin/classes POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const classMatch = path.match(/^\/org-admin\/classes\/(\d+)$/);
  if (classMatch && method === "PUT") {
    const id = parseInt(classMatch[1]);
    try {
      const { class_name } = await req.json();
      const campusIds = await getCampusIds();
      await db.from("classes").update({ class_name }).eq("id", id).in("school_id", campusIds);
      return json({ message: "Class updated" });
    } catch (err) {
      console.error("[org-admin/classes PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (classMatch && method === "DELETE") {
    const id = parseInt(classMatch[1]);
    try {
      const campusIds = await getCampusIds();
      await db.from("classes").delete().eq("id", id).in("school_id", campusIds);
      return json({ message: "Class deleted" });
    } catch (err) {
      console.error("[org-admin/classes DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/org-admin/sections" && method === "POST") {
    try {
      const { section_name, class_id } = await req.json();
      if (!section_name || !class_id) return json({ message: "section_name and class_id required" }, 400);
      const campusIds = await getCampusIds();
      const { data: cls } = await db.from("classes").select("id").eq("id", class_id).in("school_id", campusIds).single();
      if (!cls) return json({ message: "Class not in your org" }, 403);
      const { data, error } = await db.from("sections").insert({ class_id, section_name }).select().single();
      if (error) throw error;
      return json({ message: "Section created", id: data.id }, 201);
    } catch (err) {
      console.error("[org-admin/sections POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const sectionMatch = path.match(/^\/org-admin\/sections\/(\d+)$/);
  if (sectionMatch && method === "PUT") {
    const id = parseInt(sectionMatch[1]);
    try {
      const { section_name } = await req.json();
      await db.from("sections").update({ section_name }).eq("id", id);
      return json({ message: "Section updated" });
    } catch (err) {
      console.error("[org-admin/sections PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (sectionMatch && method === "DELETE") {
    const id = parseInt(sectionMatch[1]);
    try {
      await db.from("sections").delete().eq("id", id);
      return json({ message: "Section deleted" });
    } catch (err) {
      console.error("[org-admin/sections DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  LEAVES — full approve/reject across all campuses
  // ══════════════════════════════════════════════════════════════
  if (path === "/org-admin/leaves" && method === "GET") {
    try {
      const campusIds = await getCampusIds();
      if (!campusIds.length) return json([]);

      const statusFilter = url.searchParams.get("status");
      const campusFilter = url.searchParams.get("campus_id");
      const targetCampusIds = campusFilter ? [parseInt(campusFilter)] : campusIds;

      // Single query — filter via joined students.school_id to avoid large IN arrays
      // and bypass the default 1000-row PostgREST limit with .limit(10000)
      let q = db.from("leave_applications")
        .select(`id, group_id, student_id, date, reason, status, withdrawal_status, applied_at,
                 students!inner(first_name, last_name, roll_no, class_id, section_id, school_id,
                   classes(class_name), sections(section_name))`)
        .in("students.school_id", targetCampusIds)
        .order("applied_at", { ascending: false })
        .limit(10000);
      if (statusFilter) q = q.eq("status", statusFilter);

      const { data: leaves, error: leavesErr } = await q;
      if (leavesErr) { console.error("[org-admin/leaves query]", leavesErr); throw leavesErr; }

      // Group by group_id
      const grouped: Record<string, any> = {};
      for (const row of leaves || []) {
        const r = row as any;
        const s = r.students;
        const gid = String(r.group_id || r.id);
        if (!grouped[gid]) {
          grouped[gid] = {
            group_id: gid,
            student_id: r.student_id,
            student_name: `${s.first_name} ${s.last_name}`,
            roll_no: s.roll_no,
            class_name: s.classes?.class_name,
            section_name: s.sections?.section_name,
            campus_id: s.school_id,
            reason: r.reason,
            status: r.status,
            withdrawal_status: r.withdrawal_status,
            dates: [],
            applied_at: r.applied_at,
          };
        }
        grouped[gid].dates.push(r.date as string);
        const priority: Record<string, number> = { rejected: 0, approved: 1, pending: 2 };
        if (priority[r.status] < priority[grouped[gid].status]) {
          grouped[gid].status = r.status;
        }
      }
      return json(Object.values(grouped));
    } catch (err) {
      console.error("[org-admin/leaves GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // PUT /org-admin/leaves/group/:id/status — approve or reject
  const orgLeaveStatusMatch = path.match(/^\/org-admin\/leaves\/group\/([^/]+)\/status$/);
  if (orgLeaveStatusMatch && method === "PUT") {
    const groupId = orgLeaveStatusMatch[1];
    try {
      const { status } = await req.json();
      if (!["approved", "rejected"].includes(status))
        return json({ message: "status must be approved or rejected" }, 400);

      const { data: leaves } = await db.from("leave_applications")
        .select("id, student_id, date").eq("group_id", groupId);
      if (!leaves?.length) return json({ message: "Leave group not found" }, 404);

      // Verify this student belongs to one of this org's campuses
      const studentId = (leaves[0] as any).student_id as number;
      const campusIds = await getCampusIds();
      const { data: stu } = await db.from("students").select("school_id").eq("id", studentId).single();
      if (!stu || !campusIds.includes((stu as any).school_id as number))
        return json({ message: "Not found" }, 404);

      await db.from("leave_applications").update({ status }).eq("group_id", groupId);

      if (status === "approved") {
        for (const leave of leaves) {
          const l = leave as any;
          await db.from("student_attendance").upsert(
            { student_id: studentId, date: l.date, status: "leave" },
            { onConflict: "student_id,date" }
          );
        }
        (async () => {
          const { data: tokens } = await db.from("push_tokens").select("token")
            .eq("user_role", "student").eq("user_id", studentId);
          const toks = (tokens || []).map((t: any) => t.token as string).filter(Boolean);
          if (toks.length) await sendPush(toks, "Leave Approved", "Your leave request has been approved.", { type: "leave" });
        })();
      } else {
        (async () => {
          const { data: tokens } = await db.from("push_tokens").select("token")
            .eq("user_role", "student").eq("user_id", studentId);
          const toks = (tokens || []).map((t: any) => t.token as string).filter(Boolean);
          if (toks.length) await sendPush(toks, "Leave Rejected", "Your leave request has been rejected.", { type: "leave" });
        })();
      }

      return json({ message: "Status updated" });
    } catch (err) {
      console.error("[org-admin/leaves/group/status PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  NOTIFICATIONS — full target types
  // ══════════════════════════════════════════════════════════════
  if (path === "/org-admin/notifications" && method === "POST") {
    try {
      // target_type: "org" | "campus" | "staff" | "specific_admin" | "specific_teacher"
      // campus_ids: number[] (for org/staff targets)
      // campus_id: number (for campus target)
      // admin_id: number (for specific_admin)
      // teacher_id: number (for specific_teacher)
      const { title, body, target_type, campus_ids, campus_id, admin_id, teacher_id } = await req.json();
      if (!title?.trim() || !body?.trim()) return json({ message: "title and body required" }, 400);
      if (!target_type) return json({ message: "target_type required" }, 400);

      const allCampusIds = await getCampusIds();
      if (!allCampusIds.length) return json({ message: "No campuses" }, 400);

      const senderName = `${(user as any).first_name || ""} ${(user as any).last_name || ""}`.trim() || "Org Admin";
      const insertRows: Record<string, unknown>[] = [];
      const pushPromises: Promise<void>[] = [];

      const addNotif = (schoolId: number, extra?: Record<string, unknown>) =>
        insertRows.push({
          school_id: schoolId, sender_id: user.id, sender_name: senderName,
          sender_role: "org_admin", title: title.trim(), message: body.trim(),
          target_type: "school", category: "announcement", ...extra,
        });

      if (target_type === "org") {
        // Send to all campuses → shows in staff inbox of each
        const targets = (campus_ids?.length
          ? (campus_ids as number[]).filter(id => allCampusIds.includes(id))
          : allCampusIds);
        for (const cid of targets) addNotif(cid);
        pushPromises.push((async () => {
          for (const cid of targets) {
            const { data: admins } = await db.from("admins").select("id").eq("school_id", cid);
            const { data: teachers } = await db.from("teachers").select("id").eq("school_id", cid);
            const adminIds = (admins || []).map((a: any) => a.id as number);
            const teacherIds = (teachers || []).map((t: any) => t.id as number);
            const [aToks, tToks] = await Promise.all([
              adminIds.length ? db.from("push_tokens").select("token").eq("user_role", "admin").in("user_id", adminIds) : { data: [] },
              teacherIds.length ? db.from("push_tokens").select("token").eq("user_role", "teacher").in("user_id", teacherIds) : { data: [] },
            ]);
            const toks = [...(aToks.data || []), ...(tToks.data || [])].map((t: any) => t.token).filter(Boolean);
            if (toks.length) await sendPush(toks, title.trim(), body.trim(), { type: "notification" });
          }
        })());
      } else if (target_type === "campus") {
        if (!campus_id || !allCampusIds.includes(campus_id)) return json({ message: "Invalid campus_id" }, 400);
        addNotif(campus_id);
        pushPromises.push((async () => {
          const { data: admins } = await db.from("admins").select("id").eq("school_id", campus_id);
          const { data: teachers } = await db.from("teachers").select("id").eq("school_id", campus_id);
          const adminIds = (admins || []).map((a: any) => a.id as number);
          const teacherIds = (teachers || []).map((t: any) => t.id as number);
          const [aToks, tToks] = await Promise.all([
            adminIds.length ? db.from("push_tokens").select("token").eq("user_role", "admin").in("user_id", adminIds) : { data: [] },
            teacherIds.length ? db.from("push_tokens").select("token").eq("user_role", "teacher").in("user_id", teacherIds) : { data: [] },
          ]);
          const toks = [...(aToks.data || []), ...(tToks.data || [])].map((t: any) => t.token).filter(Boolean);
          if (toks.length) await sendPush(toks, title.trim(), body.trim(), { type: "notification" });
        })());
      } else if (target_type === "staff") {
        const targets = campus_ids?.length
          ? (campus_ids as number[]).filter(id => allCampusIds.includes(id))
          : allCampusIds;
        for (const cid of targets) addNotif(cid);
        // same push as org
        pushPromises.push((async () => {
          for (const cid of targets) {
            const { data: admins } = await db.from("admins").select("id").eq("school_id", cid);
            const { data: teachers } = await db.from("teachers").select("id").eq("school_id", cid);
            const adminIds = (admins || []).map((a: any) => a.id as number);
            const teacherIds = (teachers || []).map((t: any) => t.id as number);
            const [aToks, tToks] = await Promise.all([
              adminIds.length ? db.from("push_tokens").select("token").eq("user_role", "admin").in("user_id", adminIds) : { data: [] },
              teacherIds.length ? db.from("push_tokens").select("token").eq("user_role", "teacher").in("user_id", teacherIds) : { data: [] },
            ]);
            const toks = [...(aToks.data || []), ...(tToks.data || [])].map((t: any) => t.token).filter(Boolean);
            if (toks.length) await sendPush(toks, title.trim(), body.trim(), { type: "notification" });
          }
        })());
      } else if (target_type === "specific_admin") {
        if (!admin_id) return json({ message: "admin_id required" }, 400);
        const { data: adm } = await db.from("admins").select("id, school_id").eq("id", admin_id).single();
        if (!adm || !allCampusIds.includes((adm as any).school_id as number))
          return json({ message: "Admin not found in your org" }, 404);
        addNotif((adm as any).school_id as number, { target_type: "specific_admin", target_user_id: admin_id });
        pushPromises.push((async () => {
          const { data: tokens } = await db.from("push_tokens").select("token").eq("user_role", "admin").eq("user_id", admin_id);
          const toks = (tokens || []).map((t: any) => t.token).filter(Boolean);
          if (toks.length) await sendPush(toks, title.trim(), body.trim(), { type: "notification" });
        })());
      } else if (target_type === "specific_teacher") {
        if (!teacher_id) return json({ message: "teacher_id required" }, 400);
        const { data: tch } = await db.from("teachers").select("id, school_id").eq("id", teacher_id).single();
        if (!tch || !allCampusIds.includes((tch as any).school_id as number))
          return json({ message: "Teacher not found in your org" }, 404);
        addNotif((tch as any).school_id as number, { target_type: "specific_teacher", target_user_id: teacher_id });
        pushPromises.push((async () => {
          const { data: tokens } = await db.from("push_tokens").select("token").eq("user_role", "teacher").eq("user_id", teacher_id);
          const toks = (tokens || []).map((t: any) => t.token).filter(Boolean);
          if (toks.length) await sendPush(toks, title.trim(), body.trim(), { type: "notification" });
        })());
      } else {
        return json({ message: "Invalid target_type" }, 400);
      }

      if (insertRows.length) await db.from("notifications").insert(insertRows);
      Promise.all(pushPromises).catch(err => console.error("[org-admin/notifications push]", err));

      return json({ message: "Notification sent", count: insertRows.length }, 201);
    } catch (err) {
      console.error("[org-admin/notifications POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  PARENTS — org-level with multi-campus access
  // ══════════════════════════════════════════════════════════════
  if (path === "/org-admin/parents" && method === "GET") {
    try {
      const campusId = url.searchParams.get("campus_id");
      const campusIds = campusId ? [parseInt(campusId)] : await getCampusIds();
      if (!campusIds.length) return json([]);

      // Parents directly on any org campus
      const { data: schoolParents } = await db.from("parents")
        .select("id, first_name, last_name, email, phone, school_id, created_at")
        .in("school_id", campusIds).order("last_name");

      // Parents via parent_school_access junction (multi-campus org parents)
      const { data: accessRows } = await db.from("parent_school_access")
        .select("parent_id").in("school_id", campusIds);
      const existingIds = new Set((schoolParents || []).map((p: Record<string, unknown>) => p.id as number));
      const freshIds = [...new Set((accessRows || []).map((r: Record<string, unknown>) => r.parent_id as number))]
        .filter(id => !existingIds.has(id));

      let orgParents: Record<string, unknown>[] = [];
      if (freshIds.length) {
        const { data } = await db.from("parents")
          .select("id, first_name, last_name, email, phone, school_id, created_at").in("id", freshIds);
        orgParents = (data || []) as Record<string, unknown>[];
      }

      const allParents = [...(schoolParents || []) as Record<string, unknown>[], ...orgParents];
      const sMap = await buildSchoolMap(campusIds);

      const { data: allAccess } = await db.from("parent_school_access").select("parent_id, school_id");
      const accessMap: Record<number, number[]> = {};
      for (const row of allAccess || []) {
        const r = row as Record<string, unknown>;
        const pid = r.parent_id as number;
        if (!accessMap[pid]) accessMap[pid] = [];
        accessMap[pid].push(r.school_id as number);
      }

      return json(allParents.map(p => {
        const pid = p.id as number;
        const campusNames = (accessMap[pid] || []).map(cid => sMap[cid]).filter(Boolean);
        return {
          ...p,
          campus_name: sMap[p.school_id as number] || null,
          campus_names: campusNames.length ? campusNames : [sMap[p.school_id as number]].filter(Boolean),
        };
      }));
    } catch (err) {
      console.error("[org-admin/parents GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/org-admin/parents" && method === "POST") {
    try {
      const { first_name, last_name, email, password, phone, campus_ids } = await req.json();
      if (!first_name || !last_name || !email || !password)
        return json({ message: "Missing required fields" }, 400);
      if (!campus_ids?.length) return json({ message: "At least one campus required" }, 400);
      const allCampusIds = await getCampusIds();
      const validIds = (campus_ids as number[]).filter(id => allCampusIds.includes(id));
      if (!validIds.length) return json({ message: "No valid campuses" }, 400);
      const hashed = await hashPassword(password);
      const { data, error } = await db.from("parents")
        .insert({ first_name: first_name.trim(), last_name: last_name.trim(), email: email.trim().toLowerCase(), password: hashed, phone: phone || null, school_id: validIds[0] })
        .select().single();
      if (error) {
        if (error.code === "23505") return json({ message: "Email already exists" }, 409);
        throw error;
      }
      if (validIds.length > 1) {
        await db.from("parent_school_access").insert(validIds.map((sid: number) => ({ parent_id: data.id, school_id: sid })));
      }
      return json({ message: "Parent created", id: data.id }, 201);
    } catch (err) {
      console.error("[org-admin/parents POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const parentMatch = path.match(/^\/org-admin\/parents\/(\d+)$/);
  if (parentMatch && method === "PUT") {
    const id = parseInt(parentMatch[1]);
    try {
      const { first_name, last_name, email, phone, password, campus_ids } = await req.json();
      const upd: Record<string, unknown> = { first_name, last_name, email: email?.trim().toLowerCase(), phone: phone || null };
      if (password) upd.password = await hashPassword(password);
      await db.from("parents").update(upd).eq("id", id);
      if (campus_ids) {
        const allCampusIds = await getCampusIds();
        const validIds = (campus_ids as number[]).filter(sid => allCampusIds.includes(sid));
        await db.from("parent_school_access").delete().eq("parent_id", id);
        if (validIds.length > 1) {
          await db.from("parent_school_access").insert(validIds.map((sid: number) => ({ parent_id: id, school_id: sid })));
        }
        if (validIds.length) await db.from("parents").update({ school_id: validIds[0] }).eq("id", id);
      }
      return json({ message: "Parent updated" });
    } catch (err) {
      console.error("[org-admin/parents PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (parentMatch && method === "DELETE") {
    const id = parseInt(parentMatch[1]);
    try {
      await db.from("parent_school_access").delete().eq("parent_id", id);
      await db.from("parents").delete().eq("id", id);
      return json({ message: "Parent deleted" });
    } catch (err) {
      console.error("[org-admin/parents DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  CAMPUS LOGO UPLOAD
  // ══════════════════════════════════════════════════════════════
  const campusLogoMatch = path.match(/^\/org-admin\/campuses\/(\d+)\/logo$/);
  if (campusLogoMatch && method === "POST") {
    const id = parseInt(campusLogoMatch[1]);
    if (!(await verifyCampus(id))) return json({ message: "Not found" }, 404);
    try {
      const formData = await req.formData();
      const file = formData.get("logo") as File | null;
      if (!file) return json({ message: "logo file is required" }, 400);
      const LOGOS_BUCKET = "logos";
      const ext = file.name.split(".").pop() || "png";
      const storagePath = `${id}/logo_${Date.now()}.${ext}`;
      const buffer = await file.arrayBuffer();
      const { data: school } = await db.from("schools").select("logo_url").eq("id", id).single();
      if (school?.logo_url) {
        const oldPath = (school.logo_url as string).replace(
          `${SUPABASE_URL()}/storage/v1/object/public/${LOGOS_BUCKET}/`, ""
        );
        if (oldPath && !oldPath.startsWith("http")) {
          await db.storage.from(LOGOS_BUCKET).remove([oldPath]);
        }
      }
      const { error: storageError } = await db.storage
        .from(LOGOS_BUCKET)
        .upload(storagePath, buffer, { contentType: file.type || "image/png", upsert: true });
      if (storageError) throw storageError;
      const logo_url = `${SUPABASE_URL()}/storage/v1/object/public/${LOGOS_BUCKET}/${storagePath}`;
      await db.from("schools").update({ logo_url }).eq("id", id);
      return json({ logo_url });
    } catch (err) {
      console.error("[org-admin/campuses logo POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  SUBJECTS (per campus)
  // ══════════════════════════════════════════════════════════════
  if (path === "/org-admin/subjects" && method === "GET") {
    const campusId = url.searchParams.get("campus_id");
    if (!campusId) return json({ message: "campus_id required" }, 400);
    const cid = parseInt(campusId);
    if (!(await verifyCampus(cid))) return json({ message: "Not found" }, 404);
    try {
      const { data } = await db.from("subjects").select("id, name").eq("school_id", cid).order("name");
      return json(data || []);
    } catch (err) {
      console.error("[org-admin/subjects GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/org-admin/subjects" && method === "POST") {
    try {
      const { name, campus_id } = await req.json();
      if (!name?.trim()) return json({ message: "name is required" }, 400);
      if (!campus_id) return json({ message: "campus_id is required" }, 400);
      if (!(await verifyCampus(parseInt(campus_id)))) return json({ message: "Not found" }, 404);
      const { data, error } = await db.from("subjects")
        .insert({ school_id: parseInt(campus_id), name: name.trim() })
        .select().single();
      if (error) {
        if (error.code === "23505") return json({ message: "Subject already exists" }, 409);
        throw error;
      }
      return json(data, 201);
    } catch (err) {
      console.error("[org-admin/subjects POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const subjectMatch = path.match(/^\/org-admin\/subjects\/(\d+)$/);
  if (subjectMatch && method === "PUT") {
    const id = parseInt(subjectMatch[1]);
    try {
      const campusIds = await getCampusIds();
      const { name, campus_id } = await req.json();
      if (!name?.trim()) return json({ message: "name is required" }, 400);
      const { data: sub } = await db.from("subjects").select("school_id").eq("id", id).single();
      if (!sub || !campusIds.includes(sub.school_id as number))
        return json({ message: "Not found" }, 404);
      const updateData: Record<string, unknown> = { name: name.trim() };
      if (campus_id) updateData.school_id = parseInt(campus_id);
      const { data, error } = await db.from("subjects").update(updateData).eq("id", id).select().single();
      if (error) {
        if (error.code === "23505") return json({ message: "Subject already exists" }, 409);
        throw error;
      }
      return json(data);
    } catch (err) {
      console.error("[org-admin/subjects PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }
  if (subjectMatch && method === "DELETE") {
    const id = parseInt(subjectMatch[1]);
    try {
      const campusIds = await getCampusIds();
      // Verify subject belongs to this org
      const { data: sub } = await db.from("subjects").select("school_id").eq("id", id).single();
      if (!sub || !campusIds.includes(sub.school_id as number))
        return json({ message: "Not found" }, 404);
      await db.from("subjects").delete().eq("id", id);
      return json({ message: "Subject deleted" });
    } catch (err) {
      console.error("[org-admin/subjects DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}

// ── XLSX helpers (org-admin scoped) ────────────────────────────────────────
function toXlsxOrg(data: Record<string, unknown>[], sheetName = "Sheet1"): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
}
function xlsxResp(buf: Uint8Array, filename: string): Response {
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
function toCsvOrg(rows: Record<string, unknown>[]): string {
  if (!rows?.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => esc(row[h])).join(","));
  }
  return lines.join("\n");
}
function exportResp(
  rows: Record<string, unknown>[],
  sheetName: string,
  xlsxFilename: string,
  url: URL,
): Response {
  const format = String(url.searchParams.get("format") || "xlsx").toLowerCase();
  if (format === "csv") {
    const csv = toCsvOrg(rows);
    const csvFilename = xlsxFilename.replace(/\.xlsx$/i, ".csv");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename}"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
  return xlsxResp(toXlsxOrg(rows, sheetName), xlsxFilename);
}
function parseUploadOrg(buffer: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
}

export async function handleOrgAdminImportExport(
  req: Request,
  path: string,
  url: URL,
): Promise<Response> {
  const method = req.method;
  let user: Record<string, unknown>;
  try { user = await verifyToken(req); } catch { return json({ message: "Unauthorized" }, 401); }
  if (user.role !== "org_admin" && user.role !== "super_admin")
    return json({ message: "Forbidden" }, 403);

  const db = getDb();
  const orgIdFromTokenRaw = Number(user.org_id);
  const orgIdFromToken = Number.isFinite(orgIdFromTokenRaw) ? orgIdFromTokenRaw : null;
  const orgIdFromQuery = url.searchParams.get("org_id") ? parseInt(url.searchParams.get("org_id")!) : null;
  const orgId = user.role === "super_admin" ? (orgIdFromQuery || orgIdFromToken || null) : orgIdFromToken;

  if (user.role === "org_admin" && !orgId) {
    return json({ message: "Invalid organization scope" }, 403);
  }

  async function getCampusIds(): Promise<number[]> {
    if (orgId) {
      const { data } = await db.from("schools").select("id").eq("org_id", orgId);
      return (data || []).map((s: any) => s.id as number);
    }
    if (user.role === "super_admin") {
      const { data } = await db.from("schools").select("id");
      return (data || []).map((s: any) => s.id as number);
    }
    return [];
  }
  async function verifyCampus(id: number): Promise<boolean> {
    if (user.role === "super_admin") {
      if (orgId) {
        const { data } = await db.from("schools").select("id").eq("id", id).eq("org_id", orgId).single();
        return !!data;
      }
      const { data } = await db.from("schools").select("id").eq("id", id).single();
      return !!data;
    }
    if (!orgId) {
      const { data } = await db.from("schools").select("id").eq("id", id).single();
      return !!data;
    }
    const { data } = await db.from("schools").select("id").eq("id", id).eq("org_id", orgId).single();
    return !!data;
  }

  const campusIdParam = url.searchParams.get("campus_id") ? parseInt(url.searchParams.get("campus_id")!) : null;

  async function getScopedCampusIds(): Promise<number[]> {
    if (campusIdParam) {
      const ok = await verifyCampus(campusIdParam);
      return ok ? [campusIdParam] : [];
    }
    return await getCampusIds();
  }

  // ── CAMPUSES ──────────────────────────────────────────────────
  if (path === "/org-admin/import-export/campuses/template" && method === "GET") {
    const sample = [{ name: "Campus Alpha", city: "Karachi", address: "123 Main St" }];
    return xlsxResp(toXlsxOrg(sample, "Campuses"), "campuses_template.xlsx");
  }
  if (path === "/org-admin/import-export/campuses/export" && method === "GET") {
    try {
      let q = db.from("schools").select("name, city, address, phone").order("name");
      if (orgId) q = q.eq("org_id", orgId);
      const { data } = await q;
      return exportResp((data || []) as Record<string, unknown>[], "Campuses", "campuses_export.xlsx", url);
    } catch (err) { console.error("[org-admin/ie/campuses/export]", err); return json({ message: "Server error" }, 500); }
  }
  if (path === "/org-admin/import-export/campuses/import" && method === "POST") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return json({ message: "No file uploaded" }, 400);
      const rows = parseUploadOrg(await file.arrayBuffer());
      const errors: string[] = []; let created = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]; const rowNum = i + 2;
        if (!r.name) { errors.push(`Row ${rowNum}: name is required`); continue; }
        const { error } = await db.from("schools").insert({ org_id: orgId, name: r.name, city: r.city || null, address: r.address || null, phone: r.phone || null });
        if (error) { errors.push(`Row ${rowNum}: ${error.message}`); continue; }
        created++;
      }
      return json({ message: `Import complete. Created: ${created}, Skipped: ${errors.length}`, created, errors });
    } catch (err) { console.error("[org-admin/ie/campuses/import]", err); return json({ message: "Server error" }, 500); }
  }

  // ── ADMINS ────────────────────────────────────────────────────
  if (path === "/org-admin/import-export/admins/template" && method === "GET") {
    const campusIds = await getCampusIds();
    const { data: campuses } = await db.from("schools").select("id, name").in("id", campusIds).order("name");
    const sample = (campuses || []).slice(0, 1).map((c: any) => ({
      first_name: "Admin", last_name: "User", email: "admin@campus.com", password: "Pass@123", phone: "03001234567",
      campus_id: c.id, campus_name: c.name,
    }));
    if (!sample.length) sample.push({ first_name: "", last_name: "", email: "", password: "", phone: "", campus_id: "", campus_name: "" });
    return xlsxResp(toXlsxOrg(sample, "Admins"), "admins_template.xlsx");
  }
  if (path === "/org-admin/import-export/admins/export" && method === "GET") {
    try {
      const campusIds = await getScopedCampusIds();
      if (!campusIds.length) return exportResp([], "Admins", "admins_export.xlsx", url);
      const { data } = await db.from("admins").select("first_name, last_name, email, phone, school_id, schools(name)").in("school_id", campusIds).order("last_name");
      const rows = (data || []).map((a: any) => ({ first_name: a.first_name, last_name: a.last_name, email: a.email, phone: a.phone || "", campus_id: a.school_id, campus_name: a.schools?.name }));
      return exportResp(rows as Record<string, unknown>[], "Admins", "admins_export.xlsx", url);
    } catch (err) { console.error("[org-admin/ie/admins/export]", err); return json({ message: "Server error" }, 500); }
  }
  if (path === "/org-admin/import-export/admins/import" && method === "POST") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return json({ message: "No file uploaded" }, 400);
      const rows = parseUploadOrg(await file.arrayBuffer());
      const errors: string[] = []; let created = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]; const rowNum = i + 2;
        if (!r.first_name || !r.last_name || !r.email || !r.password || !r.campus_id) {
          errors.push(`Row ${rowNum}: first_name, last_name, email, password, campus_id are required`); continue;
        }
        const campusId = parseInt(String(r.campus_id));
        if (!(await verifyCampus(campusId))) { errors.push(`Row ${rowNum}: campus_id ${campusId} not in your org`); continue; }
        const email = String(r.email).trim().toLowerCase();
        const { data: ex } = await db.from("admins").select("id").eq("email", email).maybeSingle();
        if (ex) { errors.push(`Row ${rowNum}: email "${email}" already exists — skipped`); continue; }
        const hashed = await hashPassword(String(r.password));
        await db.from("admins").insert({ school_id: campusId, first_name: r.first_name, last_name: r.last_name, email, password: hashed, phone: r.phone || null });
        created++;
      }
      return json({ message: `Import complete. Created: ${created}, Skipped: ${errors.length}`, created, errors });
    } catch (err) { console.error("[org-admin/ie/admins/import]", err); return json({ message: "Server error" }, 500); }
  }

  // ── TEACHERS ──────────────────────────────────────────────────
  if (path === "/org-admin/import-export/teachers/template" && method === "GET") {
    const campusIds = await getScopedCampusIds();
    const { data: campuses } = await db.from("schools").select("id, name").in("id", campusIds).order("name");
    const sample = (campuses || []).slice(0, 1).map((c: any) => ({
      first_name: "Ali", last_name: "Khan", email: "ali@school.com", password: "Pass@123", phone: "03001234567",
      campus_id: c.id, campus_name: c.name,
    }));
    if (!sample.length) sample.push({ first_name: "", last_name: "", email: "", password: "", phone: "", campus_id: "", campus_name: "" });
    return xlsxResp(toXlsxOrg(sample, "Teachers"), "teachers_template.xlsx");
  }
  if (path === "/org-admin/import-export/teachers/export" && method === "GET") {
    try {
      const campusIds = await getScopedCampusIds();
      if (!campusIds.length) return exportResp([], "Teachers", "teachers_export.xlsx", url);
      const { data } = await db.from("teachers").select("first_name, last_name, email, phone, school_id, schools(name)").in("school_id", campusIds).order("last_name");
      const rows = (data || []).map((t: any) => ({ first_name: t.first_name, last_name: t.last_name, email: t.email, phone: t.phone || "", campus_id: t.school_id, campus_name: t.schools?.name }));
      return exportResp(rows as Record<string, unknown>[], "Teachers", "teachers_export.xlsx", url);
    } catch (err) { console.error("[org-admin/ie/teachers/export]", err); return json({ message: "Server error" }, 500); }
  }
  if (path === "/org-admin/import-export/teachers/import" && method === "POST") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return json({ message: "No file uploaded" }, 400);
      const rows = parseUploadOrg(await file.arrayBuffer());
      const errors: string[] = []; let created = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]; const rowNum = i + 2;
        if (!r.first_name || !r.last_name || !r.email || !r.password || !r.campus_id) {
          errors.push(`Row ${rowNum}: first_name, last_name, email, password, campus_id are required`); continue;
        }
        const campusId = parseInt(String(r.campus_id));
        if (!(await verifyCampus(campusId))) { errors.push(`Row ${rowNum}: campus_id ${campusId} not in your org`); continue; }
        const email = String(r.email).trim().toLowerCase();
        const { data: ex } = await db.from("teachers").select("id").eq("email", email).maybeSingle();
        if (ex) { errors.push(`Row ${rowNum}: email "${email}" already exists — skipped`); continue; }
        const hashed = await hashPassword(String(r.password));
        await db.from("teachers").insert({ school_id: campusId, first_name: r.first_name, last_name: r.last_name, email, password: hashed, phone: r.phone || null });
        created++;
      }
      return json({ message: `Import complete. Created: ${created}, Skipped: ${errors.length}`, created, errors });
    } catch (err) { console.error("[org-admin/ie/teachers/import]", err); return json({ message: "Server error" }, 500); }
  }

  // ── STUDENTS ──────────────────────────────────────────────────
  if (path === "/org-admin/import-export/students/template" && method === "GET") {
    try {
      const scopedIds = await getScopedCampusIds();
      const { data: classes } = await db.from("classes").select("id, class_name, school_id, sections(id, section_name), schools(name)").in("school_id", scopedIds).order("class_name");
      const rows: Record<string, unknown>[] = [];
      for (const cls of (classes || []) as any[]) {
        for (const sec of (cls.sections || []) as any[]) {
          rows.push({ first_name: "Student", last_name: "1", age: 10, roll_no: `${cls.class_name}${sec.section_name}-01`, campus_id: cls.school_id, campus_name: cls.schools?.name, class_id: cls.id, class_name: cls.class_name, section_id: sec.id, section_name: sec.section_name });
          if (rows.length >= 3) break;
        }
        if (rows.length >= 3) break;
      }
      if (!rows.length) rows.push({ first_name: "", last_name: "", age: "", roll_no: "", campus_id: "", class_id: "", section_id: "" });
      return xlsxResp(toXlsxOrg(rows, "Students"), "students_template.xlsx");
    } catch (err) { console.error("[org-admin/ie/students/template]", err); return json({ message: "Server error" }, 500); }
  }
  if (path === "/org-admin/import-export/students/export" && method === "GET") {
    try {
      const scopedIds = await getScopedCampusIds();
      if (!scopedIds.length) return exportResp([], "Students", "students_export.xlsx", url);
      const { data } = await db.from("students").select("first_name, last_name, age, roll_no, school_id, class_id, section_id, schools(name), classes(class_name), sections(section_name)").in("school_id", scopedIds).order("last_name");
      const rows = (data || []).map((s: any) => ({ first_name: s.first_name, last_name: s.last_name, age: s.age || "", roll_no: s.roll_no || "", campus_id: s.school_id, campus_name: s.schools?.name, class_id: s.class_id, class_name: s.classes?.class_name, section_id: s.section_id, section_name: s.sections?.section_name }));
      return exportResp(rows as Record<string, unknown>[], "Students", "students_export.xlsx", url);
    } catch (err) { console.error("[org-admin/ie/students/export]", err); return json({ message: "Server error" }, 500); }
  }
  if (path === "/org-admin/import-export/students/import" && method === "POST") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return json({ message: "No file uploaded" }, 400);
      const rows = parseUploadOrg(await file.arrayBuffer());
      const errors: string[] = []; let created = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]; const rowNum = i + 2;
        if (!r.first_name || !r.last_name || !r.campus_id || !r.class_id || !r.section_id) {
          errors.push(`Row ${rowNum}: first_name, last_name, campus_id, class_id, section_id are required`); continue;
        }
        const campusId = parseInt(String(r.campus_id));
        if (!(await verifyCampus(campusId))) { errors.push(`Row ${rowNum}: campus_id ${campusId} not in your org`); continue; }
        const { data: cls } = await db.from("classes").select("id").eq("id", r.class_id).eq("school_id", campusId).maybeSingle();
        if (!cls) { errors.push(`Row ${rowNum}: class_id ${r.class_id} not found in campus`); continue; }
        await db.from("students").insert({ school_id: campusId, first_name: r.first_name, last_name: r.last_name, age: r.age || null, roll_no: r.roll_no || null, class_id: r.class_id, section_id: r.section_id });
        created++;
      }
      return json({ message: `Import complete. Created: ${created}, Skipped: ${errors.length}`, created, errors });
    } catch (err) { console.error("[org-admin/ie/students/import]", err); return json({ message: "Server error" }, 500); }
  }

  // ── CLASSES / SECTIONS ────────────────────────────────────────
  if (path === "/org-admin/import-export/classes/template" && method === "GET") {
    const campusIds = await getScopedCampusIds();
    const { data: campuses } = await db.from("schools").select("id, name").in("id", campusIds).order("name");
    const sample = (campuses || []).slice(0, 1).flatMap((c: any) => [
      { campus_id: c.id, campus_name: c.name, class_name: "Grade 1", section_name: "A" },
      { campus_id: c.id, campus_name: c.name, class_name: "Grade 1", section_name: "B" },
    ]);
    if (!sample.length) sample.push({ campus_id: "", campus_name: "", class_name: "", section_name: "" });
    return xlsxResp(toXlsxOrg(sample as Record<string, unknown>[], "Classes"), "classes_template.xlsx");
  }
  if (path === "/org-admin/import-export/classes/export" && method === "GET") {
    try {
      const scopedIds = await getScopedCampusIds();
      if (!scopedIds.length) return exportResp([], "Classes", "classes_export.xlsx", url);
      const { data: classes } = await db.from("classes").select("id, class_name, school_id, sections(id, section_name), schools(name)").in("school_id", scopedIds).order("class_name");
      const rows: Record<string, unknown>[] = [];
      for (const cls of (classes || []) as any[]) {
        for (const sec of (cls.sections || []) as any[]) {
          rows.push({ campus_id: cls.school_id, campus_name: cls.schools?.name, class_id: cls.id, class_name: cls.class_name, section_id: sec.id, section_name: sec.section_name });
        }
      }
      return exportResp(rows, "Classes", "classes_export.xlsx", url);
    } catch (err) { console.error("[org-admin/ie/classes/export]", err); return json({ message: "Server error" }, 500); }
  }
  if (path === "/org-admin/import-export/classes/import" && method === "POST") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return json({ message: "No file uploaded" }, 400);
      const rows = parseUploadOrg(await file.arrayBuffer());
      const errors: string[] = []; let created = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]; const rowNum = i + 2;
        if (!r.campus_id || !r.class_name || !r.section_name) { errors.push(`Row ${rowNum}: campus_id, class_name, section_name are required`); continue; }
        const campusId = parseInt(String(r.campus_id));
        if (!(await verifyCampus(campusId))) { errors.push(`Row ${rowNum}: campus_id ${campusId} not in your org`); continue; }
        let { data: cls } = await db.from("classes").select("id").eq("class_name", r.class_name).eq("school_id", campusId).maybeSingle();
        let classId: number;
        if (!cls) {
          const { data: newCls } = await db.from("classes").insert({ school_id: campusId, class_name: r.class_name }).select("id").single();
          classId = newCls!.id;
        } else { classId = cls.id; }
        const { data: sec } = await db.from("sections").select("id").eq("class_id", classId).eq("section_name", r.section_name).maybeSingle();
        if (sec) { errors.push(`Row ${rowNum}: ${r.class_name}-${r.section_name} already exists — skipped`); continue; }
        await db.from("sections").insert({ class_id: classId, section_name: r.section_name });
        created++;
      }
      return json({ message: `Import complete. Created: ${created}, Skipped: ${errors.length}`, created, errors });
    } catch (err) { console.error("[org-admin/ie/classes/import]", err); return json({ message: "Server error" }, 500); }
  }

  // ── PARENTS ───────────────────────────────────────────────────
  if (path === "/org-admin/import-export/parents/template" && method === "GET") {
    const sample = [{ first_name: "Sara", last_name: "Ali", email: "sara@parent.com", password: "Pass@123", phone: "03001234567" }];
    return xlsxResp(toXlsxOrg(sample, "Parents"), "parents_template.xlsx");
  }
  if (path === "/org-admin/import-export/parents/export" && method === "GET") {
    try {
      const scopedIds = await getScopedCampusIds();
      if (!scopedIds.length) return exportResp([], "Parents", "parents_export.xlsx", url);

      // Include both directly assigned parents and multi-campus linked parents.
      const { data: directRows } = await db
        .from("parents")
        .select("id, first_name, last_name, email, phone, school_id")
        .in("school_id", scopedIds)
        .order("last_name");

      const { data: accessRows } = await db
        .from("parent_school_access")
        .select("parent_id")
        .in("school_id", scopedIds);

      const existingIds = new Set((directRows || []).map((p: any) => p.id));
      const viaAccessIds = [...new Set((accessRows || []).map((r: any) => r.parent_id))]
        .filter((id: number) => !existingIds.has(id));

      let linkedRows: any[] = [];
      if (viaAccessIds.length) {
        const { data } = await db
          .from("parents")
          .select("id, first_name, last_name, email, phone, school_id")
          .in("id", viaAccessIds)
          .order("last_name");
        linkedRows = data || [];
      }

      const merged = [...(directRows || []), ...linkedRows];
      const seen = new Set<number>();
      const rows = merged
        .filter((p: any) => {
          if (!p?.id || seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        })
        .map((p: any) => ({
          first_name: p.first_name || "",
          last_name: p.last_name || "",
          email: p.email || "",
          phone: p.phone || "",
        }));

      return exportResp(rows as Record<string, unknown>[], "Parents", "parents_export.xlsx", url);
    } catch (err) { console.error("[org-admin/ie/parents/export]", err); return json({ message: "Server error" }, 500); }
  }
  if (path === "/org-admin/import-export/parents/import" && method === "POST") {
    try {
      const campusIds = await getCampusIds();
      if (!campusIds.length) return json({ message: "No campuses in org" }, 400);
      // Use first campus if no campus_id given — or allow campus_id column
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return json({ message: "No file uploaded" }, 400);
      const rows = parseUploadOrg(await file.arrayBuffer());
      const errors: string[] = []; let created = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]; const rowNum = i + 2;
        if (!r.first_name || !r.last_name || !r.email || !r.password) {
          errors.push(`Row ${rowNum}: first_name, last_name, email, password are required`); continue;
        }
        const email = String(r.email).trim().toLowerCase();
        const { data: ex } = await db.from("parents").select("id").eq("email", email).maybeSingle();
        if (ex) { errors.push(`Row ${rowNum}: email "${email}" already exists — skipped`); continue; }
        const campusId = r.campus_id ? parseInt(String(r.campus_id)) : campusIds[0];
        const hashed = await hashPassword(String(r.password));
        const { data: p } = await db.from("parents").insert({ school_id: campusId, first_name: r.first_name, last_name: r.last_name, email, password: hashed, phone: r.phone || null }).select("id").single();
        if (p) await db.from("parent_school_access").upsert({ parent_id: p.id, school_id: campusId }, { onConflict: "parent_id,school_id" }).then(() => {}).catch(() => {});
        created++;
      }
      return json({ message: `Import complete. Created: ${created}, Skipped: ${errors.length}`, created, errors });
    } catch (err) { console.error("[org-admin/ie/parents/import]", err); return json({ message: "Server error" }, 500); }
  }

  return json({ message: "Not found" }, 404);
}


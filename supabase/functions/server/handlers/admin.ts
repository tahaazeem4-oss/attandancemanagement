// handlers/admin.ts — admin dashboard, teachers, students, classes, assignments, leaves
import {
  json,
  getDb,
  verifyToken,
  hashPassword,
  sendPush,
  tokensForStudents,
} from "../_shared.ts";
import {
  archiveClass,
  archiveTeacher,
  getClassDeleteImpact,
  getTeacherDeleteImpact,
  unarchiveClass,
  unarchiveTeacher,
} from "../lib/deletion.ts";

export async function handleAdmin(
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
  if (user.role !== "admin" && user.role !== "super_admin")
    return json({ message: "Forbidden" }, 403);

  const db = getDb();
  const schoolId = user.school_id as number;

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

  // ── GET /admin/stats ─────────────────────────────────────────
  if (path === "/admin/stats" && method === "GET") {
    try {
      const { data: leaveRows, error: leaveErr } = await db
        .from("leave_applications")
        .select("group_id, status, withdrawal_status, students!inner(school_id)")
        .eq("students.school_id", schoolId);
      if (leaveErr) throw leaveErr;

      const pendingGroups = new Set<string>();
      for (const row of leaveRows || []) {
        const r = row as Record<string, unknown>;
        const gid = String(r.group_id ?? "");
        if (!gid) continue;
        if (r.status === "pending" || r.withdrawal_status === "pending") pendingGroups.add(gid);
      }

      const [
        { count: teachers },
        { count: students },
        { count: classes },
        { count: student_accounts },
      ] = await Promise.all([
        db.from("teachers").select("*", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_active", true),
        db.from("students").select("*", { count: "exact", head: true }).eq("school_id", schoolId),
        db.from("classes").select("*", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_active", true),
        db.from("student_accounts")
          .select("*, students!inner(school_id)", { count: "exact", head: true })
          .eq("students.school_id", schoolId),
      ]);
      return json({ teachers, students, classes, pending_leaves: pendingGroups.size, student_accounts });
    } catch (err) {
      console.error("[admin/stats]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /admin/teachers ──────────────────────────────────────
  if (path === "/admin/teachers" && method === "GET") {
    try {
      const { data: teachers } = await db
        .from("teachers")
        .select("id, first_name, last_name, email, phone, teacher_role, created_at")
        .eq("school_id", schoolId)
        .eq("is_active", true)
        .order("last_name");

      const { data: assignments } = await db
        .from("teacher_classes")
        .select(
          `teacher_id, class_id, section_id,
           classes!inner(class_name), sections!inner(section_name)`,
        )
        .in(
          "teacher_id",
          (teachers || []).map((t: Record<string, unknown>) => t.id),
        );

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

      const result = (teachers || []).map((t: Record<string, unknown>) => ({
        ...t,
        assignments: assignMap[t.id as number] || [],
        teacher_role: (t.teacher_role as string) || deriveRoleFromAssignments(assignMap[t.id as number] || []),
      }));

      return json(result);
    } catch (err) {
      console.error("[admin/teachers GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /admin/teachers ─────────────────────────────────────
  if (path === "/admin/teachers" && method === "POST") {
    try {
      const body = await req.json();
      const { first_name, last_name, email, password, phone, assignments } = body;
      if (!first_name || !last_name || !email || !password || !phone)
        return json({ message: "first_name, last_name, email, password and phone are required" }, 400);

      const normalizedAssignments = Array.isArray(assignments) ? assignments : [];
      const requestedRole = body.teacher_role;
      const teacherRole = ["class_teacher", "floor_incharge", "subject_teacher"].includes(requestedRole)
        ? requestedRole
        : deriveRoleFromAssignments(normalizedAssignments);
      const roleValidationError = validateTeacherRoleAssignments(teacherRole, normalizedAssignments);
      if (roleValidationError) return json({ message: roleValidationError }, 400);

      const hashed = await hashPassword(password);
      const { data: t, error } = await db
        .from("teachers")
        .insert({
          school_id: schoolId,
          first_name,
          last_name,
          email: email.trim().toLowerCase(),
          password: hashed,
          phone: phone.trim(),
          teacher_role: teacherRole,
        })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") return json({ message: "Email or phone already exists" }, 409);
        throw error;
      }

      if (normalizedAssignments.length) {
        await db.from("teacher_classes").insert(
          normalizedAssignments.map((a: Record<string, unknown>) => ({
            teacher_id: t.id,
            class_id: a.class_id,
            section_id: a.section_id,
          })),
        );
      }

      return json({ message: "Teacher created", id: t.id }, 201);
    } catch (err) {
      console.error("[admin/teachers POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT /admin/teachers/:id ──────────────────────────────────
  const teacherImpactMatch = path.match(/^\/admin\/teachers\/(\d+)\/delete-impact$/);
  if (teacherImpactMatch && method === "GET") {
    const id = parseInt(teacherImpactMatch[1]);
    const { data: teacher } = await db.from("teachers").select("school_id").eq("id", id).eq("school_id", schoolId).maybeSingle();
    if (!teacher) return json({ message: "Not found" }, 404);
    return json(await getTeacherDeleteImpact(db, id));
  }

  const teacherRestoreMatch = path.match(/^\/admin\/teachers\/(\d+)\/restore$/);
  if (teacherRestoreMatch && method === "POST") {
    const id = parseInt(teacherRestoreMatch[1]);
    const { data: teacher } = await db.from("teachers").select("school_id").eq("id", id).eq("school_id", schoolId).maybeSingle();
    if (!teacher) return json({ message: "Not found" }, 404);
    try {
      await unarchiveTeacher(db, id);
      return json({ message: "Teacher restored", restored: true });
    } catch (err) {
      return json({ message: err instanceof Error ? err.message : "Failed to restore" }, 400);
    }
  }

  const teacherMatch = path.match(/^\/admin\/teachers\/(\d+)$/);
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

      await db
        .from("teachers")
        .update({
          first_name,
          last_name,
          email: email?.trim().toLowerCase(),
          phone: phone || null,
          teacher_role: teacherRole,
        })
        .eq("id", id)
        .eq("school_id", schoolId);

      // Replace assignments
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
      console.error("[admin/teachers PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /admin/teachers/:id ───────────────────────────────
  if (teacherMatch && method === "DELETE") {
    const id = parseInt(teacherMatch[1]);
    try {
      const { data: teacher } = await db.from("teachers").select("school_id").eq("id", id).eq("school_id", schoolId).maybeSingle();
      if (!teacher) return json({ message: "Not found" }, 404);
      const replacementTeacherId = Number(url.searchParams.get("replacement_teacher_id") || "") || null;
      try {
        const result = await archiveTeacher(db, id, Number(user.id), String(user.role), replacementTeacherId);
        return json({
          message: result.reassigned ? "Teacher reassigned and archived" : "Teacher archived",
          archived: true,
          reassigned: result.reassigned,
          impact: result.impact,
        });
      } catch (archiveErr) {
        return json({
          message: archiveErr instanceof Error ? archiveErr.message : "Teacher cannot be deleted yet",
          impact: await getTeacherDeleteImpact(db, id),
        }, 409);
      }
    } catch (err) {
      console.error("[admin/teachers DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /admin/teachers/:id/reset-password ──────────────────
  const teacherResetMatch = path.match(/^\/admin\/teachers\/(\d+)\/reset-password$/);
  if (teacherResetMatch && method === "POST") {
    const id = parseInt(teacherResetMatch[1]);
    try {
      const { new_password } = await req.json();
      const hashed = await hashPassword(new_password);
      await db.from("teachers").update({ password: hashed }).eq("id", id).eq("school_id", schoolId);
      return json({ message: "Password reset" });
    } catch (err) {
      console.error("[admin/teachers/reset-password]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /admin/students ──────────────────────────────────────
  if (path === "/admin/students" && method === "GET") {
    try {
      const classId = url.searchParams.get("class_id");
      const sectionId = url.searchParams.get("section_id");

      let q = db
        .from("students")
        .select(
          `id, first_name, last_name, age, roll_no, class_id, section_id, created_at,
           classes!inner(class_name), sections!inner(section_name)`,
        )
        .eq("school_id", schoolId)
        .order("last_name");

      if (classId) q = q.eq("class_id", classId);
      if (sectionId) q = q.eq("section_id", sectionId);

      const { data: students } = await q;

      const studentIds = (students || []).map((s: Record<string, unknown>) => s.id as number);
      const { data: links } = studentIds.length
        ? await db.from("parent_student").select("student_id, parent_id").in("student_id", studentIds)
        : { data: [] };

      const parentIds = [...new Set((links || []).map((l: Record<string, unknown>) => l.parent_id as number))];
      const { data: parents } = parentIds.length
        ? await db.from("parents").select("id, email").in("id", parentIds)
        : { data: [] };

      const parentEmailById = new Map(
        (parents || []).map((p: Record<string, unknown>) => [p.id as number, p.email as string]),
      );

      const parentEmailsByStudent = new Map<number, string[]>();
      for (const link of links || []) {
        const sid = (link as Record<string, unknown>).student_id as number;
        const pid = (link as Record<string, unknown>).parent_id as number;
        const email = parentEmailById.get(pid);
        if (!email) continue;
        if (!parentEmailsByStudent.has(sid)) parentEmailsByStudent.set(sid, []);
        const list = parentEmailsByStudent.get(sid)!;
        if (!list.includes(email)) list.push(email);
      }

      const result = (students || []).map((s: Record<string, unknown>) => ({
        ...s,
        class_name: (s.classes as Record<string, unknown>).class_name,
        section_name: (s.sections as Record<string, unknown>).section_name,
        has_parent: (parentEmailsByStudent.get(s.id as number) || []).length > 0,
        parent_email: (parentEmailsByStudent.get(s.id as number) || [])[0] || null,
        parent_emails: parentEmailsByStudent.get(s.id as number) || [],
      }));

      return json(result);
    } catch (err) {
      console.error("[admin/students GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /admin/students ─────────────────────────────────────
  if (path === "/admin/students" && method === "POST") {
    try {
      const body = await req.json();
      // Enforce student ID uniqueness across the whole organization
      if (body.roll_no) {
        const { data: schoolRow } = await db.from("schools").select("org_id").eq("id", schoolId).single();
        const orgId = (schoolRow as any)?.org_id;
        let orgSchoolIds: number[] = [schoolId];
        if (orgId) {
          const { data: peers } = await db.from("schools").select("id").eq("org_id", orgId);
          orgSchoolIds = (peers || []).map((s: any) => Number(s.id));
        }
        const { data: dup } = await db.from("students").select("id")
          .in("school_id", orgSchoolIds)
          .eq("roll_no", String(body.roll_no).trim())
          .maybeSingle();
        if (dup)
          return json({ message: `Student ID "${body.roll_no}" is already in use in this organization.` }, 409);
      }
      const { school_id: _s, ...studentBody } = body;
      const { data, error } = await db
        .from("students")
        .insert({ school_id: schoolId, ...studentBody, roll_no: body.roll_no || null })
        .select()
        .single();
      if (error) throw error;
      return json({ message: "Student created", id: data.id }, 201);
    } catch (err) {
      console.error("[admin/students POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const studentMatch = path.match(/^\/admin\/students\/(\d+)$/);
  // ── PUT /admin/students/:id ────────────────────────────────
  if (studentMatch && method === "PUT") {
    const id = parseInt(studentMatch[1]);
    try {
      const body = await req.json();
      // Enforce student ID uniqueness across the whole organization (exclude self)
      if (body.roll_no) {
        const { data: schoolRow } = await db.from("schools").select("org_id").eq("id", schoolId).single();
        const orgId = (schoolRow as any)?.org_id;
        let orgSchoolIds: number[] = [schoolId];
        if (orgId) {
          const { data: peers } = await db.from("schools").select("id").eq("org_id", orgId);
          orgSchoolIds = (peers || []).map((s: any) => Number(s.id));
        }
        const { data: dup } = await db.from("students").select("id")
          .in("school_id", orgSchoolIds)
          .eq("roll_no", String(body.roll_no).trim())
          .neq("id", id)
          .maybeSingle();
        if (dup)
          return json({ message: `Student ID "${body.roll_no}" is already in use in this organization.` }, 409);
      }
      const { school_id: _s, ...studentBody } = body;
      await db
        .from("students")
        .update({ ...studentBody, roll_no: body.roll_no || null })
        .eq("id", id)
        .eq("school_id", schoolId);
      return json({ message: "Student updated" });
    } catch (err) {
      console.error("[admin/students PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /admin/students/:id ───────────────────────────────
  if (studentMatch && method === "DELETE") {
    const id = parseInt(studentMatch[1]);
    try {
      await db.from("students").delete().eq("id", id).eq("school_id", schoolId);
      return json({ message: "Student deleted" });
    } catch (err) {
      console.error("[admin/students DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /admin/students/:id/reset-password ──────────────────
  const studentResetMatch = path.match(/^\/admin\/students\/(\d+)\/reset-password$/);
  if (studentResetMatch && method === "POST") {
    const id = parseInt(studentResetMatch[1]);
    try {
      const { new_password } = await req.json();
      const hashed = await hashPassword(new_password);
      await db.from("student_accounts").update({ password: hashed }).eq("student_id", id);
      return json({ message: "Password reset" });
    } catch (err) {
      console.error("[admin/students/reset-password]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /admin/classes ───────────────────────────────────────
  if (path === "/admin/classes" && method === "GET") {
    try {
      const { data: classes } = await db
        .from("classes")
        .select("id, class_name")
        .eq("school_id", schoolId)
        .eq("is_active", true)
        .order("class_name");

      const { data: sections } = await db
        .from("sections")
        .select("id, class_id, section_name")
        .eq("is_active", true)
        .in(
          "class_id",
          (classes || []).map((c: Record<string, unknown>) => c.id),
        );

      const secMap: Record<number, unknown[]> = {};
      for (const s of sections || []) {
        const r = s as Record<string, unknown>;
        const cid = r.class_id as number;
        if (!secMap[cid]) secMap[cid] = [];
        secMap[cid].push(r);
      }

      const result = (classes || []).map((c: Record<string, unknown>) => ({
        ...c,
        sections: secMap[c.id as number] || [],
      }));
      return json(result);
    } catch (err) {
      console.error("[admin/classes GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /admin/classes ──────────────────────────────────────
  if (path === "/admin/classes" && method === "POST") {
    try {
      const { class_name } = await req.json();
      const { data, error } = await db
        .from("classes")
        .insert({ school_id: schoolId, class_name })
        .select()
        .single();
      if (error) throw error;
      return json({ message: "Class created", id: data.id }, 201);
    } catch (err) {
      console.error("[admin/classes POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const classImpactMatch = path.match(/^\/admin\/classes\/(\d+)\/delete-impact$/);
  if (classImpactMatch && method === "GET") {
    const id = parseInt(classImpactMatch[1]);
    const { data: cls } = await db.from("classes").select("school_id").eq("id", id).eq("school_id", schoolId).maybeSingle();
    if (!cls) return json({ message: "Not found" }, 404);
    return json(await getClassDeleteImpact(db, id));
  }

  const classRestoreMatch = path.match(/^\/admin\/classes\/(\d+)\/restore$/);
  if (classRestoreMatch && method === "POST") {
    const id = parseInt(classRestoreMatch[1]);
    const { data: cls } = await db.from("classes").select("school_id").eq("id", id).eq("school_id", schoolId).maybeSingle();
    if (!cls) return json({ message: "Not found" }, 404);
    try {
      await unarchiveClass(db, id);
      return json({ message: "Class restored", restored: true });
    } catch (err) {
      return json({ message: err instanceof Error ? err.message : "Failed to restore" }, 400);
    }
  }

  const adminClassMatch = path.match(/^\/admin\/classes\/(\d+)$/);
  // ── PUT /admin/classes/:id ───────────────────────────────────
  if (adminClassMatch && method === "PUT") {
    const id = parseInt(adminClassMatch[1]);
    try {
      const { class_name } = await req.json();
      await db.from("classes").update({ class_name }).eq("id", id).eq("school_id", schoolId);
      return json({ message: "Class updated" });
    } catch (err) {
      console.error("[admin/classes PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /admin/classes/:id ────────────────────────────────
  if (adminClassMatch && method === "DELETE") {
    const id = parseInt(adminClassMatch[1]);
    try {
      const { data: cls } = await db.from("classes").select("school_id").eq("id", id).eq("school_id", schoolId).maybeSingle();
      if (!cls) return json({ message: "Not found" }, 404);
      try {
        const result = await archiveClass(db, id, Number(user.id), String(user.role));
        return json({ message: "Class archived", archived: true, impact: result.impact });
      } catch (archiveErr) {
        return json({
          message: archiveErr instanceof Error ? archiveErr.message : "Class cannot be deleted yet",
          impact: await getClassDeleteImpact(db, id),
        }, 409);
      }
    } catch (err) {
      console.error("[admin/classes DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /admin/classes/:id/sections ─────────────────────────
  const adminClassSectionsMatch = path.match(/^\/admin\/classes\/(\d+)\/sections$/);
  if (adminClassSectionsMatch && method === "POST") {
    const classId = parseInt(adminClassSectionsMatch[1]);
    try {
      const { section_name } = await req.json();
      const { data, error } = await db
        .from("sections")
        .insert({ class_id: classId, section_name })
        .select()
        .single();
      if (error) throw error;
      return json({ message: "Section created", id: data.id }, 201);
    } catch (err) {
      console.error("[admin/classes/:id/sections POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /admin/sections/:id ───────────────────────────────
  const adminSectionDeleteMatch = path.match(/^\/admin\/sections\/(\d+)$/);
  if (adminSectionDeleteMatch && method === "DELETE") {
    const id = parseInt(adminSectionDeleteMatch[1]);
    try {
      await db.from("sections").delete().eq("id", id);
      return json({ message: "Section deleted" });
    } catch (err) {
      console.error("[admin/sections DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /admin/assignments ───────────────────────────────────
  if (path === "/admin/assignments" && method === "GET") {
    try {
      const { data: teachers } = await db
        .from("teachers")
        .select("id")
        .eq("school_id", schoolId);

      if (!teachers?.length) return json([]);

      const { data } = await db
        .from("teacher_classes")
        .select(
          `id, teacher_id, class_id, section_id,
           teachers!inner(first_name, last_name),
           classes!inner(class_name),
           sections!inner(section_name)`,
        )
        .in(
          "teacher_id",
          teachers.map((t: Record<string, unknown>) => t.id),
        );

      const result = (data || []).map((r: Record<string, unknown>) => ({
        id: r.id,
        teacher_id: r.teacher_id,
        class_id: r.class_id,
        section_id: r.section_id,
        teacher_name: `${(r.teachers as Record<string, unknown>).first_name} ${(r.teachers as Record<string, unknown>).last_name}`,
        class_name: (r.classes as Record<string, unknown>).class_name,
        section_name: (r.sections as Record<string, unknown>).section_name,
      }));
      return json(result);
    } catch (err) {
      console.error("[admin/assignments GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /admin/assignments ──────────────────────────────────
  if (path === "/admin/assignments" && method === "POST") {
    try {
      const { teacher_id, class_id, section_id } = await req.json();
      const { data, error } = await db
        .from("teacher_classes")
        .insert({ teacher_id, class_id, section_id })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") return json({ message: "Assignment already exists" }, 409);
        throw error;
      }
      return json({ message: "Assignment created", id: data.id }, 201);
    } catch (err) {
      console.error("[admin/assignments POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /admin/assignments/:id ────────────────────────────
  const assignmentDeleteMatch = path.match(/^\/admin\/assignments\/(\d+)$/);
  if (assignmentDeleteMatch && method === "DELETE") {
    const id = parseInt(assignmentDeleteMatch[1]);
    try {
      await db.from("teacher_classes").delete().eq("id", id);
      return json({ message: "Assignment deleted" });
    } catch (err) {
      console.error("[admin/assignments DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /admin/leaves ────────────────────────────────────────
  if (path === "/admin/leaves" && method === "GET") {
    try {
      const statusFilter = url.searchParams.get("status");

      // Get all student IDs for this school first
      const { data: schoolStudents } = await db
        .from("students")
        .select("id")
        .eq("school_id", schoolId);

      const studentIds = (schoolStudents || []).map(
        (s: Record<string, unknown>) => s.id as number,
      );
      if (!studentIds.length) return json([]);

      let q = db
        .from("leave_applications")
        .select(
          `id, group_id, student_id, date, reason, status, withdrawal_status, applied_at,
           students!inner(first_name, last_name, roll_no, class_id, section_id,
             classes!inner(class_name), sections!inner(section_name)
           )`,
        )
        .in("student_id", studentIds)
        .order("applied_at", { ascending: false });

      if (statusFilter) q = q.eq("status", statusFilter);

      const { data: leaves } = await q;

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
        const priority: Record<string, number> = { rejected: 0, approved: 1, pending: 2 };
        const cur = (grouped[gid] as Record<string, unknown>).status as string;
        const next = r.status as string;
        if (priority[next] < priority[cur]) {
          (grouped[gid] as Record<string, unknown>).status = next;
        }
      }

      return json(Object.values(grouped));
    } catch (err) {
      console.error("[admin/leaves GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT /admin/leaves/group/:id/status ───────────────────────
  const adminLeaveStatusMatch = path.match(/^\/admin\/leaves\/group\/([^/]+)\/status$/);
  if (adminLeaveStatusMatch && method === "PUT") {
    const groupId = adminLeaveStatusMatch[1];
    try {
      const { status } = await req.json();
      if (!["approved", "rejected"].includes(status))
        return json({ message: "Invalid status" }, 400);

      // Fetch the leave rows so we can mark attendance and notify
      const { data: leaves } = await db
        .from("leave_applications")
        .select("id, student_id, date")
        .eq("group_id", groupId);

      if (!leaves?.length)
        return json({ message: "Leave group not found" }, 404);

      await db.from("leave_applications").update({ status }).eq("group_id", groupId);

      const studentId = (leaves[0] as Record<string, unknown>).student_id as number;

      if (status === "approved") {
        // Lock attendance as 'leave' for each requested date
        for (const leave of leaves) {
          const l = leave as Record<string, unknown>;
          await db.from("student_attendance").upsert(
            { student_id: studentId, date: l.date, status: "leave" },
            { onConflict: "student_id,date" },
          );
        }
        tokensForStudents(db, [studentId]).then((tokens) =>
          sendPush(tokens, "Leave Approved", "Your leave request has been approved by the admin.", { type: "leave" })
        );
      } else {
        tokensForStudents(db, [studentId]).then((tokens) =>
          sendPush(tokens, "Leave Rejected", "Your leave request has been rejected by the admin.", { type: "leave" })
        );
      }

      return json({ message: "Status updated", count: leaves.length });
    } catch (err) {
      console.error("[admin/leaves/group/status]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT /admin/leaves/group/:id/withdrawal ────────────────────
  const adminWithdrawalMatch = path.match(/^\/admin\/leaves\/group\/([^/]+)\/withdrawal$/);
  if (adminWithdrawalMatch && method === "PUT") {
    const groupId = adminWithdrawalMatch[1];
    try {
      const { action } = await req.json();
      if (!["approve", "reject"].includes(action))
        return json({ message: "action must be approve or reject" }, 400);

      const { data: leaves, error: leavesErr } = await db
        .from("leave_applications")
        .select("id, student_id, date")
        .eq("group_id", groupId)
        .eq("withdrawal_status", "pending");

      if (leavesErr) {
        console.error("[admin/leaves/group/withdrawal] fetch error", leavesErr);
        return json({ message: "Server error" }, 500);
      }

      if (!leaves?.length)
        return json({ message: "No pending withdrawal found for this group" }, 404);

      const studentId = (leaves[0] as Record<string, unknown>).student_id as number;

      if (action === "approve") {
        // Schema constraint allows withdrawal_status only as pending/rejected, so
        // approval clears withdrawal_status and cancels the leave.
        const { error: cancelErr } = await db.from("leave_applications")
          .update({ status: "cancelled", withdrawal_status: null })
          .eq("group_id", groupId)
          .eq("withdrawal_status", "pending");
        if (cancelErr) {
          console.error("[admin/leaves/group/withdrawal] cancel error", cancelErr);
          return json({ message: "Could not approve withdrawal" }, 500);
        }
        for (const leave of leaves) {
          const l = leave as Record<string, unknown>;
          const { error: deleteErr } = await db.from("student_attendance")
            .delete()
            .eq("student_id", studentId)
            .eq("date", l.date)
            .eq("status", "leave");
          if (deleteErr) {
            console.error("[admin/leaves/group/withdrawal] attendance delete error", deleteErr);
            return json({ message: "Could not unlock attendance" }, 500);
          }
        }
        tokensForStudents(db, [studentId]).then((tokens) =>
          sendPush(tokens, "Withdrawal Approved", "Your leave withdrawal request has been approved by the admin.", { type: "withdrawal_decision", action })
        );
      } else {
        const { error: rejectErr } = await db.from("leave_applications")
          .update({ withdrawal_status: "rejected" })
          .eq("group_id", groupId)
          .eq("withdrawal_status", "pending");
        if (rejectErr) {
          console.error("[admin/leaves/group/withdrawal] reject error", rejectErr);
          return json({ message: "Could not update withdrawal status" }, 500);
        }
        tokensForStudents(db, [studentId]).then((tokens) =>
          sendPush(tokens, "Withdrawal Rejected", "Your leave withdrawal request has been rejected by the admin.", { type: "withdrawal_decision", action })
        );
      }

      return json({ message: action === "approve" ? "Withdrawal approved" : "Withdrawal rejected" });
    } catch (err) {
      console.error("[admin/leaves/group/withdrawal]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /admin/teacher-attendance ───────────────────────────
  // Query params: teacher_id (optional), year, month
  // Returns rows grouped by teacher, with per-day status + summary counts
  if (path === "/admin/teacher-attendance" && method === "GET") {
    try {
      const teacherId  = url.searchParams.get("teacher_id");
      const year       = parseInt(url.searchParams.get("year")  || String(new Date().getFullYear()));
      const month      = parseInt(url.searchParams.get("month") || String(new Date().getMonth() + 1));

      const from = `${year}-${String(month).padStart(2, "0")}-01`;
      const toDate = new Date(year, month, 0); // last day of month
      const to   = `${year}-${String(month).padStart(2, "0")}-${String(toDate.getDate()).padStart(2, "0")}`;

      // Fetch teachers for this school
      let tq = db.from("teachers").select("id, first_name, last_name, email, phone").eq("school_id", schoolId).order("last_name");
      if (teacherId) tq = tq.eq("id", teacherId);
      const { data: teachers } = await tq;
      if (!teachers?.length) return json([]);

      const teacherIds = teachers.map((t: Record<string, unknown>) => t.id as number);

      // Fetch attendance records for these teachers in the month
      const { data: records } = await db
        .from("teacher_attendance")
        .select("teacher_id, date, status, check_in")
        .in("teacher_id", teacherIds)
        .gte("date", from)
        .lte("date", to)
        .order("date");

      // Group by teacher
      const recMap: Record<number, Record<string, unknown>[]> = {};
      for (const r of records || []) {
        const row = r as Record<string, unknown>;
        const tid = row.teacher_id as number;
        if (!recMap[tid]) recMap[tid] = [];
        recMap[tid].push(row);
      }

      const result = teachers.map((t: Record<string, unknown>) => {
        const days = recMap[t.id as number] || [];
        const present = days.filter((d) => d.status === "present").length;
        const absent  = days.filter((d) => d.status === "absent").length;
        const leave   = days.filter((d) => d.status === "leave").length;
        return {
          id:         t.id,
          first_name: t.first_name,
          last_name:  t.last_name,
          email:      t.email,
          phone:      t.phone,
          summary: { present, absent, leave, total: days.length },
          days,
        };
      });

      return json(result);
    } catch (err) {
      console.error("[admin/teacher-attendance GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}

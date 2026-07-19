// handlers/superAdmin.ts — super admin routes
import { json, getDb, verifyToken, hashPassword, SUPABASE_URL } from "../_shared.ts";
import {
  archiveClass,
  archiveSchool,
  archiveSubject,
  archiveTeacher,
  getClassDeleteImpact,
  getSchoolDeleteImpact,
  getSubjectDeleteImpact,
  getTeacherDeleteImpact,
  unarchiveSchool,
  unarchiveSubject,
  unarchiveTeacher,
} from "../lib/deletion.ts";

export async function handleSuperAdmin(
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
  if (user.role !== "super_admin")
    return json({ message: "Forbidden" }, 403);

  const db = getDb();
  const LOGOS_BUCKET = "logos";

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

  // ── GET /super-admin/stats ───────────────────────────────────
  if (path === "/super-admin/stats" && method === "GET") {
    try {
      const [
        { count: organizations },
        { count: schools },
        { count: admins },
        { count: teachers },
        { count: students },
      ] = await Promise.all([
        db.from("organizations").select("*", { count: "exact", head: true }),
        db.from("schools").select("*", { count: "exact", head: true }).eq("is_active", true),
        db.from("admins").select("*", { count: "exact", head: true }),
        db.from("teachers").select("*", { count: "exact", head: true }).eq("is_active", true),
        db.from("students").select("*", { count: "exact", head: true }),
      ]);
      return json({ organizations, campuses: schools, schools: organizations, admins, teachers, students });
    } catch (err) {
      console.error("[super-admin/stats]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /super-admin/organizations ───────────────────────────
  if (path === "/super-admin/organizations" && method === "GET") {
    try {
      const { data, error } = await db
        .from("organizations")
        .select("id, name, created_at")
        .order("name");
      if (error) throw error;
      return json(data || []);
    } catch (err) {
      console.error("[super-admin/organizations GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /super-admin/organizations ──────────────────────────
  if (path === "/super-admin/organizations" && method === "POST") {
    try {
      const { name } = await req.json();
      if (!name?.trim()) return json({ message: "Organization name is required" }, 400);
      const { data, error } = await db
        .from("organizations")
        .insert({ name: name.trim() })
        .select()
        .single();
      if (error) throw error;
      return json({ message: "Organization created", id: data.id }, 201);
    } catch (err) {
      console.error("[super-admin/organizations POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const orgMatch = path.match(/^\/super-admin\/organizations\/(\d+)$/);

  // ── PUT /super-admin/organizations/:id ───────────────────────
  if (orgMatch && method === "PUT") {
    const id = parseInt(orgMatch[1]);
    try {
      const { name } = await req.json();
      if (!name?.trim()) return json({ message: "Organization name is required" }, 400);
      await db.from("organizations").update({ name: name.trim() }).eq("id", id);
      return json({ message: "Organization updated" });
    } catch (err) {
      console.error("[super-admin/organizations PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /super-admin/organizations/:id ────────────────────
  if (orgMatch && method === "DELETE") {
    const id = parseInt(orgMatch[1]);
    try {
      const { count } = await db
        .from("schools")
        .select("*", { count: "exact", head: true })
        .eq("org_id", id);
      if (count && count > 0)
        return json({ message: "Cannot delete an organization that still has campuses. Delete all campuses first." }, 409);
      await db.from("organizations").delete().eq("id", id);
      return json({ message: "Organization deleted" });
    } catch (err) {
      console.error("[super-admin/organizations DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /super-admin/schools ─────────────────────────────────
  if (path === "/super-admin/schools" && method === "GET") {
    try {
      const { data: schools } = await db
        .from("schools")
        .select("*")
        .eq("is_active", true)
        .order("name");

      const result = await Promise.all(
        (schools || []).map(async (sc: Record<string, unknown>) => {
          const [
            { count: admin_count },
            { count: teacher_count },
            { count: student_count },
          ] = await Promise.all([
            db.from("admins").select("*", { count: "exact", head: true }).eq("school_id", sc.id),
            db.from("teachers").select("*", { count: "exact", head: true }).eq("school_id", sc.id).eq("is_active", true),
            db.from("students").select("*", { count: "exact", head: true }).eq("school_id", sc.id),
          ]);
          return { ...sc, admin_count, teacher_count, student_count };
        }),
      );
      return json(result);
    } catch (err) {
      console.error("[super-admin/schools GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /super-admin/schools ────────────────────────────────
  if (path === "/super-admin/schools" && method === "POST") {
    try {
      const body = await req.json();
      const { data, error } = await db.from("schools").insert(body).select().single();
      if (error) throw error;
      return json({ message: "School created", id: data.id }, 201);
    } catch (err) {
      console.error("[super-admin/schools POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT /super-admin/schools/:id ─────────────────────────────
  const schoolImpactMatch = path.match(/^\/super-admin\/schools\/(\d+)\/delete-impact$/);
  if (schoolImpactMatch && method === "GET") {
    const id = parseInt(schoolImpactMatch[1]);
    return json(await getSchoolDeleteImpact(db, id));
  }

  const schoolMatch = path.match(/^\/super-admin\/schools\/(\d+)$/);
  if (schoolMatch && method === "PUT") {
    const id = parseInt(schoolMatch[1]);
    try {
      const body = await req.json();
      await db.from("schools").update(body).eq("id", id);
      return json({ message: "School updated" });
    } catch (err) {
      console.error("[super-admin/schools PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const schoolLogoMatch = path.match(/^\/super-admin\/schools\/(\d+)\/logo$/);
  if (schoolLogoMatch && method === "POST") {
    const id = parseInt(schoolLogoMatch[1]);
    try {
      const { data: school } = await db.from("schools").select("id, logo_url").eq("id", id).maybeSingle();
      if (!school?.id) return json({ message: "Not found" }, 404);

      const formData = await req.formData();
      const file = formData.get("logo") as File | null;
      if (!file) return json({ message: "logo file is required" }, 400);

      const ext = file.name.split(".").pop() || "png";
      const storagePath = `${id}/logo_${Date.now()}.${ext}`;
      const buffer = await file.arrayBuffer();

      if (school.logo_url) {
        const oldPath = (school.logo_url as string).replace(
          `${SUPABASE_URL()}/storage/v1/object/public/${LOGOS_BUCKET}/`,
          "",
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
      console.error("[super-admin/schools/:id/logo POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /super-admin/schools/:id ─────────────────────────
  if (schoolMatch && method === "DELETE") {
    const id = parseInt(schoolMatch[1]);
    try {
      const result = await archiveSchool(db, id, Number(user.id), String(user.role));
      return json({ message: "School archived", archived: true, impact: result.impact });
    } catch (err) {
      console.error("[super-admin/schools DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /super-admin/schools/:id/restore ───────────────────
  const schoolRestoreMatch = path.match(/^\/super-admin\/schools\/(\d+)\/restore$/);
  if (schoolRestoreMatch && method === "POST") {
    const id = parseInt(schoolRestoreMatch[1]);
    try {
      await unarchiveSchool(db, id);
      return json({ message: "School restored", restored: true });
    } catch (err) {
      return json({ message: err instanceof Error ? err.message : "Failed to restore" }, 400);
    }
  }

  // ── GET /super-admin/schools/:id/admins ──────────────────────
  const schoolAdminsMatch = path.match(/^\/super-admin\/schools\/(\d+)\/admins$/);
  if (schoolAdminsMatch && method === "GET") {
    const schoolId = parseInt(schoolAdminsMatch[1]);
    try {
      const { data } = await db
        .from("admins")
        .select("id, first_name, last_name, email, phone")
        .eq("school_id", schoolId);
      return json(data || []);
    } catch (err) {
      console.error("[super-admin/schools/:id/admins GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /super-admin/schools/:id/admins ─────────────────────
  if (schoolAdminsMatch && method === "POST") {
    const schoolId = parseInt(schoolAdminsMatch[1]);
    try {
      const { first_name, last_name, email, password, phone } = await req.json();
      if (!first_name || !last_name || !email || !password || !phone)
        return json({ message: "first_name, last_name, email, password and phone are required" }, 400);
      const normalizedPhone = phone.trim();
      if (!/^03[0-9]{9}$/.test(normalizedPhone))
        return json({ message: "Phone must be in format 03XXXXXXXXX (11 digits)" }, 400);
      const { data: phoneDup } = await db.from("admins").select("id").eq("phone", normalizedPhone).maybeSingle();
      if (phoneDup) return json({ message: "Phone number already in use" }, 409);
      const hashed = await hashPassword(password);
      const { data, error } = await db
        .from("admins")
        .insert({ school_id: schoolId, first_name, last_name, email: email.trim().toLowerCase(), password: hashed, phone: normalizedPhone })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") return json({ message: "Email or phone already exists" }, 409);
        throw error;
      }
      return json({ message: "Admin created", id: data.id }, 201);
    } catch (err) {
      console.error("[super-admin/schools/:id/admins POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT /super-admin/schools/:schoolId/admins/:adminId ───────
  const adminMatch = path.match(/^\/super-admin\/schools\/(\d+)\/admins\/(\d+)$/);
  if (adminMatch && method === "PUT") {
    const adminId = parseInt(adminMatch[2]);
    try {
      const { first_name, last_name, email, phone } = await req.json();
      const updates: Record<string, unknown> = { first_name, last_name, email: email?.trim().toLowerCase() };
      if (phone !== undefined) {
        const normalizedPhone = phone.trim();
        if (normalizedPhone && !/^03[0-9]{9}$/.test(normalizedPhone))
          return json({ message: "Phone must be in format 03XXXXXXXXX (11 digits)" }, 400);
        updates.phone = normalizedPhone || null;
      }
      await db.from("admins").update(updates).eq("id", adminId);
      return json({ message: "Admin updated" });
    } catch (err) {
      console.error("[super-admin/admins PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /super-admin/schools/:schoolId/admins/:adminId ────
  if (adminMatch && method === "DELETE") {
    const adminId = parseInt(adminMatch[2]);
    try {
      await db.from("admins").delete().eq("id", adminId);
      return json({ message: "Admin deleted" });
    } catch (err) {
      console.error("[super-admin/admins DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /super-admin/schools/:schoolId/admins/:adminId/reset-password
  const adminResetMatch = path.match(/^\/super-admin\/schools\/(\d+)\/admins\/(\d+)\/reset-password$/);
  if (adminResetMatch && method === "POST") {
    const adminId = parseInt(adminResetMatch[2]);
    try {
      const { new_password } = await req.json();
      const hashed = await hashPassword(new_password);
      await db.from("admins").update({ password: hashed }).eq("id", adminId);
      return json({ message: "Password reset" });
    } catch (err) {
      console.error("[super-admin/admins/reset-password]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET/POST /super-admin/schools/:schoolId/teachers ──────────
  const schoolTeachersMatch = path.match(/^\/super-admin\/schools\/(\d+)\/teachers$/);
  if (schoolTeachersMatch && method === "GET") {
    const schoolId = parseInt(schoolTeachersMatch[1]);
    try {
      const classId = url.searchParams.get("class_id");
      const sectionId = url.searchParams.get("section_id");

      const { data: teachers } = await db
        .from("teachers")
        .select("id, first_name, last_name, email, phone, teacher_role")
        .eq("school_id", schoolId)
        .eq("is_active", true);

      const { data: assignments } = await db
        .from("teacher_classes")
        .select(`teacher_id, class_id, section_id, classes!inner(class_name), sections!inner(section_name)`)
        .in("teacher_id", (teachers || []).map((t: Record<string, unknown>) => t.id));

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

      let result = (teachers || []).map((t: Record<string, unknown>) => ({
        ...t,
        assignments: assignMap[t.id as number] || [],
        teacher_role: (t.teacher_role as string) || deriveRoleFromAssignments(assignMap[t.id as number] || []),
      }));

      if (classId) {
        result = result.filter((t: Record<string, unknown>) =>
          (t.assignments as Record<string, unknown>[]).some(
            (a) =>
              String(a.class_id) === classId &&
              (!sectionId || String(a.section_id) === sectionId),
          )
        );
      }
      return json(result);
    } catch (err) {
      console.error("[super-admin/schools/:id/teachers GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (schoolTeachersMatch && method === "POST") {
    const schoolId = parseInt(schoolTeachersMatch[1]);
    try {
      const body = await req.json();
      const { first_name, last_name, email, password, phone, assignments } = body;
      if (!first_name || !last_name || !email || !password || !phone)
        return json({ message: "first_name, last_name, email, password and phone are required" }, 400);
      const normalizedAssignments = Array.isArray(assignments) ? assignments : [];
      const teacherRole = ["class_teacher", "floor_incharge", "subject_teacher"].includes(body.teacher_role)
        ? body.teacher_role
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
          normalizedAssignments.map((a: Record<string, unknown>) => ({ teacher_id: t.id, class_id: a.class_id, section_id: a.section_id })),
        );
      }
      return json({ message: "Teacher created", id: t.id }, 201);
    } catch (err) {
      console.error("[super-admin/schools/:id/teachers POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT/DELETE/RESET /super-admin/schools/:schoolId/teachers/:id ─
  const schoolTeacherImpactMatch = path.match(/^\/super-admin\/schools\/\d+\/teachers\/(\d+)\/delete-impact$/);
  if (schoolTeacherImpactMatch && method === "GET") {
    const id = parseInt(schoolTeacherImpactMatch[1]);
    return json(await getTeacherDeleteImpact(db, id));
  }

  const schoolTeacherIdMatch = path.match(/^\/super-admin\/schools\/\d+\/teachers\/(\d+)$/);
  if (schoolTeacherIdMatch && method === "PUT") {
    const id = parseInt(schoolTeacherIdMatch[1]);
    try {
      const body = await req.json();
      const { first_name, last_name, email, phone, assignments } = body;
      const normalizedAssignments = Array.isArray(assignments) ? assignments : [];
      const teacherRole = ["class_teacher", "floor_incharge", "subject_teacher"].includes(body.teacher_role)
        ? body.teacher_role
        : deriveRoleFromAssignments(normalizedAssignments);
      const roleValidationError = validateTeacherRoleAssignments(teacherRole, normalizedAssignments);
      if (roleValidationError) return json({ message: roleValidationError }, 400);

      await db.from("teachers").update({
        first_name,
        last_name,
        email: email?.trim().toLowerCase(),
        phone: phone || null,
        teacher_role: teacherRole,
      }).eq("id", id);
      await db.from("teacher_classes").delete().eq("teacher_id", id);
      if (normalizedAssignments.length) {
        await db.from("teacher_classes").insert(
          normalizedAssignments.map((a: Record<string, unknown>) => ({ teacher_id: id, class_id: a.class_id, section_id: a.section_id })),
        );
      }
      return json({ message: "Teacher updated" });
    } catch (err) {
      console.error("[super-admin/schools/:id/teachers/:id PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (schoolTeacherIdMatch && method === "DELETE") {
    const id = parseInt(schoolTeacherIdMatch[1]);
    try {
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
      console.error("[super-admin/schools/:id/teachers/:id DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const schoolTeacherRestoreMatch = path.match(/^\/super-admin\/schools\/\d+\/teachers\/(\d+)\/restore$/);
  if (schoolTeacherRestoreMatch && method === "POST") {
    const id = parseInt(schoolTeacherRestoreMatch[1]);
    try {
      await unarchiveTeacher(db, id);
      return json({ message: "Teacher restored", restored: true });
    } catch (err) {
      return json({ message: err instanceof Error ? err.message : "Failed to restore" }, 400);
    }
  }

  const schoolTeacherResetMatch = path.match(/^\/super-admin\/schools\/\d+\/teachers\/(\d+)\/reset-password$/);
  if (schoolTeacherResetMatch && method === "POST") {
    const id = parseInt(schoolTeacherResetMatch[1]);
    try {
      const { new_password } = await req.json();
      const hashed = await hashPassword(new_password);
      await db.from("teachers").update({ password: hashed }).eq("id", id);
      return json({ message: "Password reset" });
    } catch (err) {
      console.error("[super-admin/schools/:id/teachers/:id/reset-password]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET/POST /super-admin/schools/:schoolId/students ──────────
  const schoolStudentsMatch = path.match(/^\/super-admin\/schools\/(\d+)\/students$/);
  if (schoolStudentsMatch && method === "GET") {
    const schoolId = parseInt(schoolStudentsMatch[1]);
    try {
      const classId = url.searchParams.get("class_id");
      const sectionId = url.searchParams.get("section_id");
      let q = db
        .from("students")
        .select(`id, first_name, last_name, age, roll_no, class_id, section_id,
                 classes!inner(class_name), sections!inner(section_name)`)
        .eq("school_id", schoolId)
        .order("last_name");
      if (classId) q = q.eq("class_id", classId);
      if (sectionId) q = q.eq("section_id", sectionId);
      const { data } = await q;

      const studentIds = (data || []).map((s: Record<string, unknown>) => s.id as number);
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

      const result = (data || []).map((s: Record<string, unknown>) => ({
        ...s,
        class_name: (s.classes as Record<string, unknown>).class_name,
        section_name: (s.sections as Record<string, unknown>).section_name,
        has_parent: (parentEmailsByStudent.get(s.id as number) || []).length > 0,
        parent_email: (parentEmailsByStudent.get(s.id as number) || [])[0] || null,
        parent_emails: parentEmailsByStudent.get(s.id as number) || [],
      }));
      return json(result);
    } catch (err) {
      console.error("[super-admin/schools/:id/students GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (schoolStudentsMatch && method === "POST") {
    const schoolId = parseInt(schoolStudentsMatch[1]);
    try {
      const body = await req.json();
      // Enforce roll_no uniqueness within school+class+section
      if (body.roll_no) {
        const { data: dup } = await db
          .from("students")
          .select("id")
          .eq("school_id", schoolId)
          .eq("class_id", body.class_id)
          .eq("section_id", body.section_id)
          .eq("roll_no", body.roll_no);
        if (dup?.length)
          return json({ message: `Roll number ${body.roll_no} is already taken in this class/section.` }, 409);
      }

      // Cross-table email uniqueness check
      if (body.email) {
        const exists = await emailExistsAnywhere(db, body.email);
        if (exists) return json({ message: `Email already exists as a ${exists}` }, 409);
      }

      const { school_id: _s, ...studentBody } = body;
      const { data, error } = await db
        .from("students")
        .insert({ school_id: schoolId, ...studentBody })
        .select()
        .single();
      if (error) throw error;
      return json({ message: "Student created", id: data.id }, 201);
    } catch (err) {
      console.error("[super-admin/schools/:id/students POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT/DELETE/RESET /super-admin/schools/:schoolId/students/:id ─
  const schoolStudentIdMatch = path.match(/^\/super-admin\/schools\/\d+\/students\/(\d+)$/);
  if (schoolStudentIdMatch && method === "PUT") {
    const id = parseInt(schoolStudentIdMatch[1]);
    try {
      const body = await req.json();
      // Enforce roll_no uniqueness (exclude self)
      if (body.roll_no && body.class_id && body.section_id) {
        const { data: existing } = await db
          .from("students")
          .select("id, school_id")
          .eq("id", id)
          .single();
        if (existing) {
          const { data: dup } = await db
            .from("students")
            .select("id")
            .eq("school_id", (existing as Record<string, unknown>).school_id as number)
            .eq("class_id", body.class_id)
            .eq("section_id", body.section_id)
            .eq("roll_no", body.roll_no)
            .neq("id", id);
          if (dup?.length)
            return json({ message: `Roll number ${body.roll_no} is already taken in this class/section.` }, 409);
        }
      }
      const { school_id: _s, ...studentBody } = body;
      await db.from("students").update({ ...studentBody, roll_no: body.roll_no || null }).eq("id", id);
      return json({ message: "Student updated" });
    } catch (err) {
      console.error("[super-admin/schools/:id/students/:id PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (schoolStudentIdMatch && method === "DELETE") {
    const id = parseInt(schoolStudentIdMatch[1]);
    try {
      await db.from("students").delete().eq("id", id);
      return json({ message: "Student deleted" });
    } catch (err) {
      console.error("[super-admin/schools/:id/students/:id DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const schoolStudentResetMatch = path.match(/^\/super-admin\/schools\/\d+\/students\/(\d+)\/reset-password$/);
  if (schoolStudentResetMatch && method === "POST") {
    const id = parseInt(schoolStudentResetMatch[1]);
    try {
      const { new_password } = await req.json();
      const hashed = await hashPassword(new_password);
      await db.from("student_accounts").update({ password: hashed }).eq("student_id", id);
      return json({ message: "Password reset" });
    } catch (err) {
      console.error("[super-admin/schools/:id/students/:id/reset-password]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const saStudentResetMatch = path.match(/^\/super-admin\/students\/(\d+)\/reset-password$/);
  if (saStudentResetMatch && method === "POST") {
    const id = parseInt(saStudentResetMatch[1]);
    try {
      const { new_password } = await req.json();
      const hashed = await hashPassword(new_password);
      await db.from("student_accounts").update({ password: hashed }).eq("student_id", id);
      return json({ message: "Password reset" });
    } catch (err) {
      console.error("[super-admin/students/reset-password]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /super-admin/schools/:schoolId/classes ────────────────
  const schoolClassesMatch = path.match(/^\/super-admin\/schools\/(\d+)\/classes$/);
  if (schoolClassesMatch && method === "GET") {
    const schoolId = parseInt(schoolClassesMatch[1]);
    try {
      const { data: classes } = await db
        .from("classes")
        .select("id, class_name")
        .eq("school_id", schoolId)
        .order("class_name");

      const { data: sections } = await db
        .from("sections")
        .select("id, class_id, section_name")
        .in("class_id", (classes || []).map((c: Record<string, unknown>) => c.id));

      const secMap: Record<number, unknown[]> = {};
      for (const s of sections || []) {
        const r = s as Record<string, unknown>;
        const cid = r.class_id as number;
        if (!secMap[cid]) secMap[cid] = [];
        secMap[cid].push(r);
      }

      return json(
        (classes || []).map((c: Record<string, unknown>) => ({
          ...c,
          sections: secMap[c.id as number] || [],
        })),
      );
    } catch (err) {
      console.error("[super-admin/schools/:id/classes GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /super-admin/schools/:schoolId/classes ────────────────
  // These class/section write endpoints didn't previously exist for
  // super_admin at all (only the list GET above did) — the shared
  // ClassesManagerScreen already called them, so every super-admin
  // "Add Class"/"Add Section" attempt 404'd outright.
  if (schoolClassesMatch && method === "POST") {
    const schoolId = parseInt(schoolClassesMatch[1]);
    try {
      const { class_name } = await req.json();
      const name = String(class_name || "").trim();
      if (!name) return json({ message: "Class name is required" }, 400);
      const { data, error } = await db.from("classes").insert({ school_id: schoolId, class_name: name }).select().single();
      if (error) throw error;
      return json({ message: "Class created", id: data.id }, 201);
    } catch (err) {
      console.error("[super-admin/schools/:id/classes POST]", err);
      return json({ message: err instanceof Error ? err.message : "Could not create class" }, 500);
    }
  }

  // ── PUT/DELETE /super-admin/schools/:schoolId/classes/:classId ─
  const schoolClassMatch = path.match(/^\/super-admin\/schools\/(\d+)\/classes\/(\d+)$/);
  if (schoolClassMatch && method === "PUT") {
    const schoolId = parseInt(schoolClassMatch[1]);
    const classId = parseInt(schoolClassMatch[2]);
    try {
      const { class_name } = await req.json();
      const name = String(class_name || "").trim();
      if (!name) return json({ message: "Class name is required" }, 400);
      await db.from("classes").update({ class_name: name }).eq("id", classId).eq("school_id", schoolId);
      return json({ message: "Class updated" });
    } catch (err) {
      console.error("[super-admin/schools/:id/classes PUT]", err);
      return json({ message: err instanceof Error ? err.message : "Could not update class" }, 500);
    }
  }
  if (schoolClassMatch && method === "DELETE") {
    const classId = parseInt(schoolClassMatch[2]);
    try {
      const result = await archiveClass(db, classId, Number(user.id), String(user.role));
      return json({ message: "Class archived", archived: true, impact: result.impact });
    } catch (err) {
      return json({
        message: err instanceof Error ? err.message : "Class cannot be deleted yet",
        impact: await getClassDeleteImpact(db, classId),
      }, 409);
    }
  }

  // ── POST /super-admin/schools/:schoolId/classes/:classId/sections ─
  const schoolClassSectionsMatch = path.match(/^\/super-admin\/schools\/(\d+)\/classes\/(\d+)\/sections$/);
  if (schoolClassSectionsMatch && method === "POST") {
    const schoolId = parseInt(schoolClassSectionsMatch[1]);
    const classId = parseInt(schoolClassSectionsMatch[2]);
    try {
      const { section_name } = await req.json();
      const name = String(section_name || "").trim();
      if (!name) return json({ message: "Section name is required" }, 400);

      const { data: cls } = await db.from("classes").select("id").eq("id", classId).eq("school_id", schoolId).maybeSingle();
      if (!cls) return json({ message: "Class not found" }, 404);

      const { data: existing } = await db.from("sections").select("id, section_name").eq("class_id", classId);
      if ((existing || []).some((s) => String(s.section_name).trim().toLowerCase() === name.toLowerCase())) {
        return json({ message: `A section named "${name}" already exists in this class.` }, 409);
      }

      const { data, error } = await db.from("sections").insert({ class_id: classId, section_name: name }).select().single();
      if (error) throw error;
      return json({ message: "Section created", id: data.id }, 201);
    } catch (err) {
      console.error("[super-admin/schools/:id/classes/:id/sections POST]", err);
      return json({ message: err instanceof Error ? err.message : "Could not create section" }, 500);
    }
  }

  // ── PUT/DELETE /super-admin/schools/:schoolId/sections/:sectionId ─
  const schoolSectionMatch = path.match(/^\/super-admin\/schools\/(\d+)\/sections\/(\d+)$/);
  if (schoolSectionMatch && method === "PUT") {
    const sectionId = parseInt(schoolSectionMatch[2]);
    try {
      const { section_name } = await req.json();
      const name = String(section_name || "").trim();
      if (!name) return json({ message: "Section name is required" }, 400);

      const { data: sec } = await db.from("sections").select("class_id").eq("id", sectionId).maybeSingle();
      if (sec?.class_id) {
        const { data: siblings } = await db.from("sections").select("id, section_name").eq("class_id", sec.class_id).neq("id", sectionId);
        if ((siblings || []).some((s) => String(s.section_name).trim().toLowerCase() === name.toLowerCase())) {
          return json({ message: `A section named "${name}" already exists in this class.` }, 409);
        }
      }

      await db.from("sections").update({ section_name: name }).eq("id", sectionId);
      return json({ message: "Section updated" });
    } catch (err) {
      console.error("[super-admin/schools/:id/sections PUT]", err);
      return json({ message: err instanceof Error ? err.message : "Could not update section" }, 500);
    }
  }
  if (schoolSectionMatch && method === "DELETE") {
    const sectionId = parseInt(schoolSectionMatch[2]);
    try {
      await db.from("sections").delete().eq("id", sectionId);
      return json({ message: "Section deleted" });
    } catch (err) {
      console.error("[super-admin/schools/:id/sections DELETE]", err);
      return json({ message: err instanceof Error ? err.message : "Could not delete section" }, 500);
    }
  }

  // ── GET /super-admin/organizations/:id/org-admins ────────────
  const orgAdminsMatch = path.match(/^\/super-admin\/organizations\/(\d+)\/org-admins$/);
  if (orgAdminsMatch && method === "GET") {
    const orgId = parseInt(orgAdminsMatch[1]);
    try {
      const { data } = await db
        .from("org_admins")
        .select("id, first_name, last_name, email, phone, created_at")
        .eq("org_id", orgId)
        .order("last_name");
      return json(data || []);
    } catch (err) {
      console.error("[super-admin/organizations/:id/org-admins GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /super-admin/organizations/:id/org-admins ────────────
  if (orgAdminsMatch && method === "POST") {
    const orgId = parseInt(orgAdminsMatch[1]);
    try {
      const { first_name, last_name, email, password, phone } = await req.json();
      if (!first_name || !last_name || !email || !password || !phone)
        return json({ message: "first_name, last_name, email, password and phone are required" }, 400);
      const normalizedPhone = phone.trim();
      if (!/^03[0-9]{9}$/.test(normalizedPhone))
        return json({ message: "Phone must be in format 03XXXXXXXXX (11 digits)" }, 400);
      // Check phone uniqueness (after normalization by DB trigger, stored as +92...)
      const { data: phoneDup } = await db.from("org_admins").select("id").eq("phone", normalizedPhone).maybeSingle();
      if (phoneDup) return json({ message: "Phone number already in use" }, 409);
      const hashed = await hashPassword(password);
      const { data, error } = await db
        .from("org_admins")
        .insert({
          org_id: orgId,
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          email: email.trim().toLowerCase(),
          password: hashed,
          phone: normalizedPhone,
        })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") return json({ message: "Email or phone already exists" }, 409);
        throw error;
      }
      return json({ message: "Org admin created", id: data.id }, 201);
    } catch (err) {
      console.error("[super-admin/organizations/:id/org-admins POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT /super-admin/organizations/:orgId/org-admins/:adminId ─
  const orgAdminIdMatch = path.match(/^\/super-admin\/organizations\/(\d+)\/org-admins\/(\d+)$/);
  if (orgAdminIdMatch && method === "PUT") {
    const adminId = parseInt(orgAdminIdMatch[2]);
    try {
      const { first_name, last_name, email, phone } = await req.json();
      if (!first_name || !last_name || !email || !phone)
        return json({ message: "first_name, last_name, email and phone are required" }, 400);
      const normalizedPhone = phone.trim();
      if (!/^03[0-9]{9}$/.test(normalizedPhone))
        return json({ message: "Phone must be in format 03XXXXXXXXX (11 digits)" }, 400);
      // Check uniqueness against another admin
      const { data: phoneDup } = await db.from("org_admins").select("id").eq("phone", normalizedPhone).neq("id", adminId).maybeSingle();
      if (phoneDup) return json({ message: "Phone number already in use" }, 409);
      await db.from("org_admins").update({ first_name: first_name.trim(), last_name: last_name.trim(), email: email.trim().toLowerCase(), phone: normalizedPhone }).eq("id", adminId);
      return json({ message: "Org admin updated" });
    } catch (err) {
      console.error("[super-admin/organizations/:id/org-admins PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /super-admin/organizations/:orgId/org-admins/:adminId
  if (orgAdminIdMatch && method === "DELETE") {
    const adminId = parseInt(orgAdminIdMatch[2]);
    try {
      await db.from("org_admins").delete().eq("id", adminId);
      return json({ message: "Org admin deleted" });
    } catch (err) {
      console.error("[super-admin/organizations/:id/org-admins DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /super-admin/organizations/:orgId/org-admins/:adminId/reset-password
  const orgAdminResetMatch = path.match(
    /^\/super-admin\/organizations\/(\d+)\/org-admins\/(\d+)\/reset-password$/,
  );
  if (orgAdminResetMatch && method === "POST") {
    const adminId = parseInt(orgAdminResetMatch[2]);
    try {
      const { new_password } = await req.json();
      const hashed = await hashPassword(new_password);
      await db.from("org_admins").update({ password: hashed }).eq("id", adminId);
      return json({ message: "Password reset" });
    } catch (err) {
      console.error("[super-admin/organizations/:id/org-admins/reset-password]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /super-admin/organizations/:id/parents ───────────────
  const orgParentsGetMatch = path.match(/^\/super-admin\/organizations\/(\d+)\/parents$/);
  if (orgParentsGetMatch && method === "GET") {
    const orgId = parseInt(orgParentsGetMatch[1]);
    try {
      // Get all schools for this org
      const { data: orgSchools } = await db
        .from("schools")
        .select("id, name")
        .eq("org_id", orgId);
      const schoolIds = (orgSchools || []).map((s: Record<string, unknown>) => s.id as number);
      const schoolNameMap: Record<number, string> = {};
      for (const s of orgSchools || []) {
        const r = s as Record<string, unknown>;
        schoolNameMap[r.id as number] = r.name as string;
      }
      if (!schoolIds.length) return json([]);

      // All parents directly assigned to these schools
      const { data: directParents } = await db
        .from("parents")
        .select("id, first_name, last_name, email, phone, school_id, created_at")
        .in("school_id", schoolIds);

      // All parents via junction table for these schools
      const { data: accessRows } = await db
        .from("parent_school_access")
        .select("parent_id, school_id")
        .in("school_id", schoolIds);

      // Collect all unique parent IDs
      const allParentIds = new Set<number>();
      for (const p of directParents || []) allParentIds.add((p as Record<string, unknown>).id as number);
      for (const r of accessRows || []) allParentIds.add((r as Record<string, unknown>).parent_id as number);

      if (!allParentIds.size) return json([]);

      const { data: allParentsData } = await db
        .from("parents")
        .select("id, first_name, last_name, email, phone, school_id, created_at")
        .in("id", Array.from(allParentIds));

      // Build campus_names for each parent from junction + direct
      const parentCampusMap: Record<number, Set<number>> = {};
      for (const r of accessRows || []) {
        const row = r as Record<string, unknown>;
        const pid = row.parent_id as number;
        if (!parentCampusMap[pid]) parentCampusMap[pid] = new Set();
        parentCampusMap[pid].add(row.school_id as number);
      }
      for (const p of directParents || []) {
        const pr = p as Record<string, unknown>;
        const pid = pr.id as number;
        const sid = pr.school_id as number;
        if (sid && schoolIds.includes(sid)) {
          if (!parentCampusMap[pid]) parentCampusMap[pid] = new Set();
          parentCampusMap[pid].add(sid);
        }
      }

      const result = (allParentsData || []).map((p: Record<string, unknown>) => {
        const pid = p.id as number;
        const campusIds = Array.from(parentCampusMap[pid] || new Set<number>());
        return {
          ...p,
          campus_names: campusIds.map(cid => schoolNameMap[cid]).filter(Boolean),
          campus_ids: campusIds,
        };
      });

      result.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        String(a.last_name || "").localeCompare(String(b.last_name || ""))
      );

      return json(result);
    } catch (err) {
      console.error("[super-admin/organizations/:id/parents GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /super-admin/schools/:id/parents ─────────────────────
  const schoolParentsGetMatch = path.match(/^\/super-admin\/schools\/(\d+)\/parents$/);
  if (schoolParentsGetMatch && method === "GET") {
    const schoolId = parseInt(schoolParentsGetMatch[1]);
    try {
      // Parents directly on this school
      const { data: directParents } = await db
        .from("parents")
        .select("id, first_name, last_name, email, phone, school_id, created_at")
        .eq("school_id", schoolId)
        .order("last_name");
      // Parents via junction table
      const { data: accessRows } = await db
        .from("parent_school_access")
        .select("parent_id")
        .eq("school_id", schoolId);
      const directIds = new Set((directParents || []).map((p: Record<string, unknown>) => p.id as number));
      const junctionIds = [...new Set((accessRows || [])
        .map((r: Record<string, unknown>) => r.parent_id as number)
        .filter(id => !directIds.has(id)))];
      let junctionParents: Record<string, unknown>[] = [];
      if (junctionIds.length) {
        const { data } = await db.from("parents")
          .select("id, first_name, last_name, email, phone, school_id, created_at")
          .in("id", junctionIds);
        junctionParents = (data || []) as Record<string, unknown>[];
      }
      const allParentsRaw = [...(directParents || []) as Record<string, unknown>[], ...junctionParents];
      const allParentsMap = new Map<number, Record<string, unknown>>();
      for (const p of allParentsRaw) {
        allParentsMap.set(p.id as number, p);
      }
      const allParents = [...allParentsMap.values()];

      // Enrich each parent with all campus names + ids they're linked to
      const allParentIds = allParents.map(p => p.id as number);
      let campusNames: Record<number, string[]> = {};
      let campusIdsByParent: Record<number, number[]> = {};
      if (allParentIds.length) {
        const { data: allAccess } = await db
          .from("parent_school_access")
          .select("parent_id, school_id, schools(name)")
          .in("parent_id", allParentIds);
        for (const row of allAccess || []) {
          const r = row as Record<string, unknown>;
          const pid = r.parent_id as number;
          const sid = r.school_id as number;
          const schoolRow = r.schools as Record<string, unknown> | null;
          const cname = schoolRow?.name as string | undefined;
          if (!campusNames[pid]) campusNames[pid] = [];
          if (!campusIdsByParent[pid]) campusIdsByParent[pid] = [];
          if (cname && !campusNames[pid].includes(cname)) campusNames[pid].push(cname);
          if (sid && !campusIdsByParent[pid].includes(sid)) campusIdsByParent[pid].push(sid);
        }
        // Also add the parent's direct school_id if not already in access table
        for (const p of allParents) {
          const pid = p.id as number;
          const sid = p.school_id as number | null;
          if (sid) {
            if (!campusIdsByParent[pid]) campusIdsByParent[pid] = [];
            if (!campusIdsByParent[pid].includes(sid)) campusIdsByParent[pid].push(sid);
            const { data: schoolRow } = await db.from("schools").select("name").eq("id", sid).single();
            if (schoolRow) {
              if (!campusNames[pid]) campusNames[pid] = [];
              const name = (schoolRow as Record<string, unknown>).name as string;
              if (!campusNames[pid].includes(name)) campusNames[pid].push(name);
            }
          }
        }
      }

      const result = allParents.map(p => ({
        ...p,
        campus_names: campusNames[p.id as number] || [],
        campus_ids: campusIdsByParent[p.id as number] || [],
      }));
      return json(result);
    } catch (err) {
      console.error("[super-admin/schools/:id/parents GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /super-admin/schools/:id/parents ────────────────────
  if (schoolParentsGetMatch && method === "POST") {
    const schoolId = parseInt(schoolParentsGetMatch[1]);
    try {
      const { first_name, last_name, email, password, phone, campus_ids } = await req.json();
      if (!email || !password) return json({ message: "Email and password are required" }, 400);
      const selectedCampusIds = Array.isArray(campus_ids)
        ? [...new Set((campus_ids as number[]).map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0))]
        : [];
      const validCampusIds = selectedCampusIds.length
        ? selectedCampusIds
        : [schoolId];
      const primaryCampusId = validCampusIds[0] || schoolId;
      const hashed = await hashPassword(password);
      const { data, error } = await db.from("parents")
        .insert({ first_name: first_name || null, last_name: last_name || null, email: email.trim().toLowerCase(), password: hashed, phone: phone || null, school_id: primaryCampusId })
        .select().single();
      if (error) {
        if (error.code === "23505") return json({ message: "Email already exists" }, 409);
        throw error;
      }
      await db
        .from("parent_school_access")
        .insert(validCampusIds.map((sid: number) => ({ parent_id: data.id, school_id: sid })))
        .then(() => {})
        .catch(() => {});
      return json({ message: "Parent created", id: data.id }, 201);
    } catch (err) {
      console.error("[super-admin/schools/:id/parents POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT/DELETE /super-admin/schools/:schoolId/parents/:parentId
  const schoolParentEditMatch = path.match(/^\/super-admin\/schools\/(\d+)\/parents\/(\d+)$/);
  if (schoolParentEditMatch && method === "PUT") {
    const parentId = parseInt(schoolParentEditMatch[2]);
    try {
      const { first_name, last_name, email, phone, password, campus_ids } = await req.json();
      const upd: Record<string, unknown> = { first_name: first_name || null, last_name: last_name || null, email: email?.trim().toLowerCase(), phone: phone || null };
      if (password) upd.password = await hashPassword(password);
      if (Array.isArray(campus_ids)) {
        const validCampusIds = [...new Set((campus_ids as number[]).map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0))];
        if (validCampusIds.length) {
          upd.school_id = validCampusIds[0];
        }
      }
      const { error } = await db.from("parents").update(upd).eq("id", parentId);
      if (error) {
        if (error.code === "23505") return json({ message: "Email already exists" }, 409);
        throw error;
      }
      if (Array.isArray(campus_ids)) {
        const validCampusIds = [...new Set((campus_ids as number[]).map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0))];
        await db.from("parent_school_access").delete().eq("parent_id", parentId);
        if (validCampusIds.length) {
          await db
            .from("parent_school_access")
            .insert(validCampusIds.map((sid: number) => ({ parent_id: parentId, school_id: sid })))
            .then(() => {})
            .catch(() => {});
        }
      }
      return json({ message: "Parent updated" });
    } catch (err) {
      console.error("[super-admin/schools/:id/parents PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }
  if (schoolParentEditMatch && method === "DELETE") {
    const parentId = parseInt(schoolParentEditMatch[2]);
    try {
      await db.from("parent_school_access").delete().eq("parent_id", parentId);
      await db.from("parents").delete().eq("id", parentId);
      return json({ message: "Parent deleted" });
    } catch (err) {
      console.error("[super-admin/schools/:id/parents DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /super-admin/parents/:id/children ───────────────────
  const parentChildrenMatch = path.match(/^\/super-admin\/parents\/(\d+)\/children$/);
  if (parentChildrenMatch && method === "GET") {
    const parentId = parseInt(parentChildrenMatch[1]);
    try {
      const { data: parent } = await db
        .from("parents")
        .select("id")
        .eq("id", parentId)
        .maybeSingle();
      if (!parent) return json({ message: "Parent not found" }, 404);

      const { data: children, error } = await db
        .from("parent_student")
        .select("student_id, relationship, students(id, first_name, last_name, school_id)")
        .eq("parent_id", parentId);

      if (error) throw error;
      return json({
        children: (children || []).map((c: any) => ({
          student_id: c.student_id,
          first_name: c.students?.first_name,
          last_name: c.students?.last_name,
          relationship: c.relationship,
          school_id: c.students?.school_id,
        })),
      });
    } catch (err) {
      console.error("[super-admin/parents/:id/children GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /super-admin/parents/:id/link-child ────────────────
  const parentLinkChildMatch = path.match(/^\/super-admin\/parents\/(\d+)\/link-child$/);
  if (parentLinkChildMatch && method === "POST") {
    const parentId = parseInt(parentLinkChildMatch[1]);
    try {
      const { student_id, relationship } = await req.json();
      if (!student_id) return json({ message: "student_id is required" }, 400);

      const { data: parent } = await db
        .from("parents")
        .select("id")
        .eq("id", parentId)
        .maybeSingle();
      if (!parent) return json({ message: "Parent not found" }, 404);

      const { data: student } = await db
        .from("students")
        .select("id, first_name, last_name, school_id")
        .eq("id", student_id)
        .maybeSingle();
      if (!student) return json({ message: "Student not found" }, 404);

      // A student can only be linked to one parent.
      const { data: existingLink } = await db
        .from("parent_student")
        .select("parent_id")
        .eq("student_id", student_id)
        .neq("parent_id", parentId)
        .maybeSingle();
      if (existingLink) return json({ message: "This student is already linked to another parent" }, 409);

      const { error } = await db
        .from("parent_student")
        .upsert(
          { parent_id: parentId, student_id, relationship: relationship || null, verified: true },
          { onConflict: "parent_id,student_id" },
        );
      if (error) throw error;

      await db
        .from("parent_school_access")
        .upsert({ parent_id: parentId, school_id: (student as any).school_id }, { onConflict: "parent_id,school_id" })
        .then(() => {})
        .catch(() => {});

      return json({
        message: "Child linked",
        student: {
          id: (student as any).id,
          first_name: (student as any).first_name,
          last_name: (student as any).last_name,
        },
      });
    } catch (err) {
      console.error("[super-admin/parents/:id/link-child POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /super-admin/parents/:parentId/children/:studentId ─
  const parentUnlinkChildMatch = path.match(/^\/super-admin\/parents\/(\d+)\/children\/(\d+)$/);
  if (parentUnlinkChildMatch && method === "DELETE") {
    const parentId = parseInt(parentUnlinkChildMatch[1]);
    const studentId = parseInt(parentUnlinkChildMatch[2]);
    try {
      const { error } = await db
        .from("parent_student")
        .delete()
        .eq("parent_id", parentId)
        .eq("student_id", studentId);
      if (error) throw error;
      return json({ message: "Child unlinked" });
    } catch (err) {
      console.error("[super-admin/parents/:id/children/:studentId DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /super-admin/schools/:id/subjects ────────────────────
  const schoolSubjectsGetMatch = path.match(/^\/super-admin\/schools\/(\d+)\/subjects$/);
  if (schoolSubjectsGetMatch && method === "GET") {
    const schoolId = parseInt(schoolSubjectsGetMatch[1]);
    try {
      const { data } = await db
        .from("subjects")
        .select("id, name")
        .eq("school_id", schoolId)
        .eq("is_active", true)
        .order("name");
      return json(data || []);
    } catch (err) {
      console.error("[super-admin/schools/:id/subjects GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /super-admin/schools/:id/subjects ───────────────────
  if (schoolSubjectsGetMatch && method === "POST") {
    const schoolId = parseInt(schoolSubjectsGetMatch[1]);
    try {
      const { name } = await req.json();
      if (!name?.trim()) return json({ message: "name is required" }, 400);
      const { data, error } = await db
        .from("subjects")
        .insert({ school_id: schoolId, name: name.trim() })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") return json({ message: "Subject already exists" }, 409);
        throw error;
      }
      return json(data, 201);
    } catch (err) {
      console.error("[super-admin/schools/:id/subjects POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const schoolSubjectImpactMatch = path.match(/^\/super-admin\/schools\/(\d+)\/subjects\/(\d+)\/delete-impact$/);
  if (schoolSubjectImpactMatch && method === "GET") {
    const schoolId = parseInt(schoolSubjectImpactMatch[1]);
    const subjectId = parseInt(schoolSubjectImpactMatch[2]);
    const { data: subject } = await db.from("subjects").select("school_id").eq("id", subjectId).eq("school_id", schoolId).maybeSingle();
    if (!subject) return json({ message: "Not found" }, 404);
    return json(await getSubjectDeleteImpact(db, subjectId));
  }

  // ── PUT /super-admin/schools/:schoolId/subjects/:subjectId ───
  const schoolSubjectEditMatch = path.match(/^\/super-admin\/schools\/(\d+)\/subjects\/(\d+)$/);
  if (schoolSubjectEditMatch && method === "PUT") {
    const schoolId = parseInt(schoolSubjectEditMatch[1]);
    const subjectId = parseInt(schoolSubjectEditMatch[2]);
    try {
      const { name } = await req.json();
      if (!name?.trim()) return json({ message: "name is required" }, 400);
      const { data, error } = await db
        .from("subjects")
        .update({ name: name.trim() })
        .eq("id", subjectId)
        .eq("school_id", schoolId)
        .select()
        .single();
      if (error) {
        if (error.code === "23505") return json({ message: "Subject already exists" }, 409);
        throw error;
      }
      return json(data);
    } catch (err) {
      console.error("[super-admin/schools/:id/subjects PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /super-admin/schools/:schoolId/subjects/:subjectId ─
  if (schoolSubjectEditMatch && method === "DELETE") {
    const schoolId = parseInt(schoolSubjectEditMatch[1]);
    const subjectId = parseInt(schoolSubjectEditMatch[2]);
    try {
      const { data: subject } = await db.from("subjects").select("school_id").eq("id", subjectId).eq("school_id", schoolId).maybeSingle();
      if (!subject) return json({ message: "Not found" }, 404);
      const result = await archiveSubject(db, subjectId, Number(user.id), String(user.role));
      return json({ message: "Subject archived", archived: true, impact: result.impact });
    } catch (err) {
      console.error("[super-admin/schools/:id/subjects DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /super-admin/schools/:schoolId/subjects/:subjectId/restore ─
  const schoolSubjectRestoreMatch = path.match(/^\/super-admin\/schools\/(\d+)\/subjects\/(\d+)\/restore$/);
  if (schoolSubjectRestoreMatch && method === "POST") {
    const schoolId = parseInt(schoolSubjectRestoreMatch[1]);
    const subjectId = parseInt(schoolSubjectRestoreMatch[2]);
    const { data: subject } = await db.from("subjects").select("school_id").eq("id", subjectId).eq("school_id", schoolId).maybeSingle();
    if (!subject) return json({ message: "Not found" }, 404);
    try {
      await unarchiveSubject(db, subjectId);
      return json({ message: "Subject restored", restored: true });
    } catch (err) {
      return json({ message: err instanceof Error ? err.message : "Failed to restore" }, 400);
    }
  }

  return json({ message: "Not found" }, 404);
}

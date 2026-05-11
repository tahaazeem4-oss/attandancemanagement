// handlers/superAdmin.ts — super admin routes
import { json, getDb, verifyToken, hashPassword } from "../_shared.ts";

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
        db.from("schools").select("*", { count: "exact", head: true }),
        db.from("admins").select("*", { count: "exact", head: true }),
        db.from("teachers").select("*", { count: "exact", head: true }),
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
        .order("name");

      const result = await Promise.all(
        (schools || []).map(async (sc: Record<string, unknown>) => {
          const [
            { count: admin_count },
            { count: teacher_count },
            { count: student_count },
          ] = await Promise.all([
            db.from("admins").select("*", { count: "exact", head: true }).eq("school_id", sc.id),
            db.from("teachers").select("*", { count: "exact", head: true }).eq("school_id", sc.id),
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

  // ── DELETE /super-admin/schools/:id ─────────────────────────
  if (schoolMatch && method === "DELETE") {
    const id = parseInt(schoolMatch[1]);
    try {
      await db.from("schools").delete().eq("id", id);
      return json({ message: "School deleted" });
    } catch (err) {
      console.error("[super-admin/schools DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /super-admin/schools/:id/admins ──────────────────────
  const schoolAdminsMatch = path.match(/^\/super-admin\/schools\/(\d+)\/admins$/);
  if (schoolAdminsMatch && method === "GET") {
    const schoolId = parseInt(schoolAdminsMatch[1]);
    try {
      const { data } = await db
        .from("admins")
        .select("id, first_name, last_name, email")
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
      const { first_name, last_name, email, password } = await req.json();
      const hashed = await hashPassword(password);
      const { data, error } = await db
        .from("admins")
        .insert({ school_id: schoolId, first_name, last_name, email: email.trim().toLowerCase(), password: hashed })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") return json({ message: "Email already exists" }, 409);
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
      const { first_name, last_name, email } = await req.json();
      await db.from("admins").update({ first_name, last_name, email: email?.trim().toLowerCase() }).eq("id", adminId);
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
        .select("id, first_name, last_name, email, phone")
        .eq("school_id", schoolId);

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
        teacher_role: (assignMap[t.id as number]?.length || 0) > 0 ? "class_teacher" : "subject_teacher",
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
      const { first_name, last_name, email, password, phone, assignments } = await req.json();
      const hashed = await hashPassword(password);
      const { data: t, error } = await db
        .from("teachers")
        .insert({ school_id: schoolId, first_name, last_name, email: email.trim().toLowerCase(), password: hashed, phone: phone || null })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") return json({ message: "Email already exists" }, 409);
        throw error;
      }
      if (Array.isArray(assignments) && assignments.length) {
        await db.from("teacher_classes").insert(
          assignments.map((a: Record<string, unknown>) => ({ teacher_id: t.id, class_id: a.class_id, section_id: a.section_id })),
        );
      }
      return json({ message: "Teacher created", id: t.id }, 201);
    } catch (err) {
      console.error("[super-admin/schools/:id/teachers POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT/DELETE/RESET /super-admin/schools/:schoolId/teachers/:id ─
  const schoolTeacherIdMatch = path.match(/^\/super-admin\/schools\/\d+\/teachers\/(\d+)$/);
  if (schoolTeacherIdMatch && method === "PUT") {
    const id = parseInt(schoolTeacherIdMatch[1]);
    try {
      const { first_name, last_name, email, phone, assignments } = await req.json();
      await db.from("teachers").update({ first_name, last_name, email: email?.trim().toLowerCase(), phone: phone || null }).eq("id", id);
      await db.from("teacher_classes").delete().eq("teacher_id", id);
      if (Array.isArray(assignments) && assignments.length) {
        await db.from("teacher_classes").insert(
          assignments.map((a: Record<string, unknown>) => ({ teacher_id: id, class_id: a.class_id, section_id: a.section_id })),
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
      await db.from("teachers").delete().eq("id", id);
      return json({ message: "Teacher deleted" });
    } catch (err) {
      console.error("[super-admin/schools/:id/teachers/:id DELETE]", err);
      return json({ message: "Server error" }, 500);
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

      const studentIds = (data || []).map((s: Record<string, unknown>) => s.id);
      const { data: accounts } = studentIds.length
        ? await db.from("student_accounts").select("student_id, email").in("student_id", studentIds)
        : { data: [] };
      const accMap = new Map(
        (accounts || []).map((a: Record<string, unknown>) => [a.student_id as number, a.email as string]),
      );

      const result = (data || []).map((s: Record<string, unknown>) => ({
        ...s,
        class_name: (s.classes as Record<string, unknown>).class_name,
        section_name: (s.sections as Record<string, unknown>).section_name,
        has_account: accMap.has(s.id as number),
        account_email: accMap.get(s.id as number) || null,
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

      const { data, error } = await db
        .from("students")
        .insert({ school_id: schoolId, ...body })
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
      await db.from("students").update({ ...body, roll_no: body.roll_no || null }).eq("id", id);
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

  // ── GET /super-admin/organizations/:id/org-admins ────────────
  const orgAdminsMatch = path.match(/^\/super-admin\/organizations\/(\d+)\/org-admins$/);
  if (orgAdminsMatch && method === "GET") {
    const orgId = parseInt(orgAdminsMatch[1]);
    try {
      const { data } = await db
        .from("org_admins")
        .select("id, first_name, last_name, email, created_at")
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
      const { first_name, last_name, email, password } = await req.json();
      if (!first_name || !last_name || !email || !password)
        return json({ message: "first_name, last_name, email and password are required" }, 400);
      const hashed = await hashPassword(password);
      const { data, error } = await db
        .from("org_admins")
        .insert({
          org_id: orgId,
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          email: email.trim().toLowerCase(),
          password: hashed,
        })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") return json({ message: "Email already exists" }, 409);
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
      const { first_name, last_name, email } = await req.json();
      await db
        .from("org_admins")
        .update({ first_name, last_name, email: email?.trim().toLowerCase() })
        .eq("id", adminId);
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

  return json({ message: "Not found" }, 404);
}

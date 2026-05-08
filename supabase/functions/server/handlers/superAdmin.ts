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
        { count: schools },
        { count: admins },
        { count: teachers },
        { count: students },
      ] = await Promise.all([
        db.from("schools").select("*", { count: "exact", head: true }),
        db.from("admins").select("*", { count: "exact", head: true }),
        db.from("teachers").select("*", { count: "exact", head: true }),
        db.from("students").select("*", { count: "exact", head: true }),
      ]);
      return json({ schools, admins, teachers, students });
    } catch (err) {
      console.error("[super-admin/stats]", err);
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

  // ── GET /super-admin/schools/:schoolId/teachers ───────────────
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

  // ── POST /super-admin/teachers ───────────────────────────────
  if (path === "/super-admin/teachers" && method === "POST") {
    try {
      const { school_id, first_name, last_name, email, password, phone, assignments } = await req.json();
      const hashed = await hashPassword(password);
      const { data: t, error } = await db
        .from("teachers")
        .insert({ school_id, first_name, last_name, email: email.trim().toLowerCase(), password: hashed, phone: phone || null })
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
      console.error("[super-admin/teachers POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const saTeacherMatch = path.match(/^\/super-admin\/teachers\/(\d+)$/);
  // ── PUT /super-admin/teachers/:id ────────────────────────────
  if (saTeacherMatch && method === "PUT") {
    const id = parseInt(saTeacherMatch[1]);
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
      console.error("[super-admin/teachers PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /super-admin/teachers/:id ─────────────────────────
  if (saTeacherMatch && method === "DELETE") {
    const id = parseInt(saTeacherMatch[1]);
    try {
      await db.from("teachers").delete().eq("id", id);
      return json({ message: "Teacher deleted" });
    } catch (err) {
      console.error("[super-admin/teachers DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /super-admin/teachers/:id/reset-password ────────────
  const saTeacherResetMatch = path.match(/^\/super-admin\/teachers\/(\d+)\/reset-password$/);
  if (saTeacherResetMatch && method === "POST") {
    const id = parseInt(saTeacherResetMatch[1]);
    try {
      const { new_password } = await req.json();
      const hashed = await hashPassword(new_password);
      await db.from("teachers").update({ password: hashed }).eq("id", id);
      return json({ message: "Password reset" });
    } catch (err) {
      console.error("[super-admin/teachers/reset-password]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /super-admin/schools/:schoolId/students ───────────────
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
      const result = (data || []).map((s: Record<string, unknown>) => ({
        ...s,
        class_name: (s.classes as Record<string, unknown>).class_name,
        section_name: (s.sections as Record<string, unknown>).section_name,
      }));
      return json(result);
    } catch (err) {
      console.error("[super-admin/schools/:id/students GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /super-admin/students ───────────────────────────────
  if (path === "/super-admin/students" && method === "POST") {
    try {
      const body = await req.json();
      const { data, error } = await db.from("students").insert(body).select().single();
      if (error) throw error;
      return json({ message: "Student created", id: data.id }, 201);
    } catch (err) {
      console.error("[super-admin/students POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  const saStudentMatch = path.match(/^\/super-admin\/students\/(\d+)$/);
  if (saStudentMatch && method === "PUT") {
    const id = parseInt(saStudentMatch[1]);
    try {
      const body = await req.json();
      await db.from("students").update(body).eq("id", id);
      return json({ message: "Student updated" });
    } catch (err) {
      console.error("[super-admin/students PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (saStudentMatch && method === "DELETE") {
    const id = parseInt(saStudentMatch[1]);
    try {
      await db.from("students").delete().eq("id", id);
      return json({ message: "Student deleted" });
    } catch (err) {
      console.error("[super-admin/students DELETE]", err);
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

  return json({ message: "Not found" }, 404);
}

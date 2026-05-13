// handlers/students.ts — student CRUD (teacher-facing)
import { json, getDb, verifyToken, resolveTeacherRole } from "../_shared.ts";

export async function handleStudents(
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
  const schoolId = user.school_id as number;

  if (user.role !== "teacher") {
    return json({ message: "Forbidden" }, 403);
  }

  const teacherRole = await resolveTeacherRole(db, user.id as number);
  if (teacherRole === "subject_teacher") {
    return json({ message: "Subject teachers cannot manage students" }, 403);
  }

  // ── GET /students?class_id=&section_id= ──────────────────────
  if (path === "/students" && method === "GET") {
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
        .order("last_name")
        .order("first_name");

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
      console.error("[students GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /students ───────────────────────────────────────────
  if (path === "/students" && method === "POST") {
    try {
      const { first_name, last_name, age, class_id, section_id, roll_no } =
        await req.json();
      if (!first_name || !last_name || !age || !class_id || !section_id)
        return json({ message: "Missing required fields" }, 400);

      if (roll_no && class_id && section_id) {
        const { data: dup } = await db
          .from("students")
          .select("id")
          .eq("school_id", schoolId)
          .eq("class_id", class_id)
          .eq("section_id", section_id)
          .eq("roll_no", roll_no);
        if (dup?.length)
          return json({ message: `Roll number ${roll_no} is already taken in this class/section.` }, 409);
      }

      const { data, error } = await db
        .from("students")
        .insert({ school_id: schoolId, first_name, last_name, age, class_id, section_id, roll_no: roll_no || null })
        .select()
        .single();

      if (error) throw error;
      return json({ message: "Student added", id: data.id }, 201);
    } catch (err) {
      console.error("[students POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT /students/:id ────────────────────────────────────────
  const updateMatch = path.match(/^\/students\/(\d+)$/);
  if (updateMatch && method === "PUT") {
    const id = parseInt(updateMatch[1]);
    try {
      const body = await req.json();
      if (body.roll_no && body.class_id && body.section_id) {
        const { data: dup } = await db
          .from("students")
          .select("id")
          .eq("school_id", schoolId)
          .eq("class_id", body.class_id)
          .eq("section_id", body.section_id)
          .eq("roll_no", body.roll_no)
          .neq("id", id);
        if (dup?.length)
          return json({ message: `Roll number ${body.roll_no} is already taken in this class/section.` }, 409);
      }

      const { error } = await db
        .from("students")
        .update({
          first_name: body.first_name,
          last_name: body.last_name,
          age: body.age,
          class_id: body.class_id,
          section_id: body.section_id,
          roll_no: body.roll_no || null,
        })
        .eq("id", id)
        .eq("school_id", schoolId);
      if (error) throw error;
      return json({ message: "Student updated" });
    } catch (err) {
      console.error("[students PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /students/:id ─────────────────────────────────────
  if (updateMatch && method === "DELETE") {
    const id = parseInt(updateMatch[1]);
    try {
      const { error } = await db
        .from("students")
        .delete()
        .eq("id", id)
        .eq("school_id", schoolId);
      if (error) throw error;
      return json({ message: "Student deleted" });
    } catch (err) {
      console.error("[students DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}

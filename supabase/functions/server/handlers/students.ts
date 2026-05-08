// handlers/students.ts — student CRUD (teacher-facing)
import { json, getDb, verifyToken } from "../_shared.ts";

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

  // ── GET /students?class_id=&section_id= ──────────────────────
  if (path === "/students" && method === "GET") {
    try {
      const classId = url.searchParams.get("class_id");
      const sectionId = url.searchParams.get("section_id");

      let q = db
        .from("students")
        .select("id, first_name, last_name, roll_no, age, class_id, section_id")
        .eq("school_id", schoolId)
        .order("last_name")
        .order("first_name");

      if (classId) q = q.eq("class_id", classId);
      if (sectionId) q = q.eq("section_id", sectionId);

      const { data } = await q;
      return json(data || []);
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

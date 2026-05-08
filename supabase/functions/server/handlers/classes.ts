// handlers/classes.ts — classes and sections
import { json, getDb, verifyToken } from "../_shared.ts";

export async function handleClasses(
  req: Request,
  path: string,
  _url: URL,
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

  // ── GET /classes ─────────────────────────────────────────────
  if (path === "/classes" && method === "GET") {
    try {
      const { data: classes } = await db
        .from("classes")
        .select("id, class_name")
        .eq("school_id", schoolId)
        .order("class_name");
      return json(classes || []);
    } catch (err) {
      console.error("[classes GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /classes ────────────────────────────────────────────
  if (path === "/classes" && method === "POST") {
    try {
      const { class_name } = await req.json();
      if (!class_name) return json({ message: "class_name is required" }, 400);
      const { data, error } = await db
        .from("classes")
        .insert({ school_id: schoolId, class_name })
        .select()
        .single();
      if (error) throw error;
      return json({ message: "Class created", id: data.id }, 201);
    } catch (err) {
      console.error("[classes POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT /classes/:id ─────────────────────────────────────────
  const classMatch = path.match(/^\/classes\/(\d+)$/);
  if (classMatch && method === "PUT") {
    const id = parseInt(classMatch[1]);
    try {
      const { class_name } = await req.json();
      const { error } = await db
        .from("classes")
        .update({ class_name })
        .eq("id", id)
        .eq("school_id", schoolId);
      if (error) throw error;
      return json({ message: "Class updated" });
    } catch (err) {
      console.error("[classes PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /classes/:id ──────────────────────────────────────
  if (classMatch && method === "DELETE") {
    const id = parseInt(classMatch[1]);
    try {
      const { error } = await db
        .from("classes")
        .delete()
        .eq("id", id)
        .eq("school_id", schoolId);
      if (error) throw error;
      return json({ message: "Class deleted" });
    } catch (err) {
      console.error("[classes DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /classes/:id/sections ────────────────────────────────
  const sectionsGetMatch = path.match(/^\/classes\/(\d+)\/sections$/);
  if (sectionsGetMatch && method === "GET") {
    const classId = parseInt(sectionsGetMatch[1]);
    try {
      const { data } = await db
        .from("sections")
        .select("id, section_name")
        .eq("class_id", classId)
        .order("section_name");
      return json(data || []);
    } catch (err) {
      console.error("[classes/:id/sections GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /classes/:id/sections ───────────────────────────────
  if (sectionsGetMatch && method === "POST") {
    const classId = parseInt(sectionsGetMatch[1]);
    try {
      const { section_name } = await req.json();
      if (!section_name) return json({ message: "section_name is required" }, 400);
      const { data, error } = await db
        .from("sections")
        .insert({ class_id: classId, section_name })
        .select()
        .single();
      if (error) throw error;
      return json({ message: "Section created", id: data.id }, 201);
    } catch (err) {
      console.error("[classes/:id/sections POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /sections/:id ─────────────────────────────────────
  const sectionDeleteMatch = path.match(/^\/sections\/(\d+)$/);
  if (sectionDeleteMatch && method === "DELETE") {
    const id = parseInt(sectionDeleteMatch[1]);
    try {
      const { error } = await db.from("sections").delete().eq("id", id);
      if (error) throw error;
      return json({ message: "Section deleted" });
    } catch (err) {
      console.error("[sections DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}

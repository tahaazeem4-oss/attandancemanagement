// handlers/subjects.ts
import { json, getDb, verifyToken } from "../_shared.ts";

export async function handleSubjects(
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

  // GET /subjects
  if (path === "/subjects" && method === "GET") {
    try {
      const { data } = await db
        .from("subjects")
        .select("id, name")
        .eq("school_id", schoolId)
        .order("name");
      return json(data || []);
    } catch (err) {
      console.error("[subjects GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // POST /subjects (admin only)
  if (path === "/subjects" && method === "POST") {
    if (user.role !== "admin" && user.role !== "super_admin")
      return json({ message: "Forbidden" }, 403);
    try {
      const { name } = await req.json();
      if (!name) return json({ message: "name is required" }, 400);
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
      console.error("[subjects POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // DELETE /subjects/:id
  const deleteMatch = path.match(/^\/subjects\/(\d+)$/);
  if (deleteMatch && method === "DELETE") {
    if (user.role !== "admin" && user.role !== "super_admin")
      return json({ message: "Forbidden" }, 403);
    const id = parseInt(deleteMatch[1]);
    try {
      await db.from("subjects").delete().eq("id", id).eq("school_id", schoolId);
      return json({ message: "Subject deleted" });
    } catch (err) {
      console.error("[subjects DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}

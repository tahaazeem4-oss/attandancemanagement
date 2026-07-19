// handlers/pushToken.ts
import { json, getDb, verifyToken } from "../_shared.ts";

export async function handlePushToken(
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
  const role = user.role as string;
  // Students log in via student_accounts, so the JWT's `id` is the account row's id,
  // not the roster id (`students.id`). Every push recipient lookup (tokensForStudents,
  // tokensForClassStudents, the notifications feed, etc.) filters by the roster id, so
  // student tokens must be stored under `student_id`, not `id`, or they never match.
  const userId = (role === "student" ? user.student_id : user.id) as number;

  // POST /push-token — upsert
  if (path === "/push-token" && method === "POST") {
    try {
      const { token } = await req.json();
      if (!token) return json({ message: "token is required" }, 400);
      await db.from("push_tokens").upsert(
        { user_role: role, user_id: userId, token },
        { onConflict: "user_role,user_id" },
      );
      return json({ message: "Token saved" });
    } catch (err) {
      console.error("[push-token POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // DELETE /push-token
  if (path === "/push-token" && method === "DELETE") {
    try {
      await db
        .from("push_tokens")
        .delete()
        .eq("user_role", role)
        .eq("user_id", userId);
      return json({ message: "Token removed" });
    } catch (err) {
      console.error("[push-token DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}

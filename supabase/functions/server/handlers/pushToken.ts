// handlers/pushToken.ts
import { json, getDb, verifyToken } from "../_shared.ts";

export async function handlePushToken(
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
  const role = user.role as string;
  // Students log in via student_accounts, so the JWT's `id` is the account row's id,
  // not the roster id (`students.id`). Every push recipient lookup (tokensForStudents,
  // tokensForClassStudents, the notifications feed, etc.) filters by the roster id, so
  // student tokens must be stored under `student_id`, not `id`, or they never match.
  const userId = (role === "student" ? user.student_id : user.id) as number;

  if (!userId) return json({ message: "Unauthorized" }, 401);

  // POST /push-token — upsert. Tokens are unique per device, so a user can have
  // several devices, and a device that switches accounts is reassigned here.
  if (path === "/push-token" && method === "POST") {
    try {
      const { token } = await req.json();
      if (!token) return json({ message: "token is required" }, 400);
      const { error } = await db.from("push_tokens").upsert(
        { user_role: role, user_id: userId, token, updated_at: new Date().toISOString() },
        { onConflict: "token" },
      );
      if (error) {
        console.error("[push-token POST] upsert failed:", error);
        return json({ message: "Could not save token" }, 500);
      }
      return json({ message: "Token saved" });
    } catch (err) {
      console.error("[push-token POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // DELETE /push-token?token=... — removes only the logging-out device's token.
  // Older app builds send no token; for those, fall back to clearing the user's tokens.
  if (path === "/push-token" && method === "DELETE") {
    try {
      let query = db
        .from("push_tokens")
        .delete()
        .eq("user_role", role)
        .eq("user_id", userId);
      const token = url.searchParams.get("token");
      if (token) query = query.eq("token", token);
      const { error } = await query;
      if (error) {
        console.error("[push-token DELETE] delete failed:", error);
        return json({ message: "Could not remove token" }, 500);
      }
      return json({ message: "Token removed" });
    } catch (err) {
      console.error("[push-token DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}

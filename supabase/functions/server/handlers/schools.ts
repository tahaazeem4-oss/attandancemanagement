// handlers/schools.ts — public school listing (no auth required)
import { json, getDb, SUPABASE_URL } from "../_shared.ts";

const LOGOS_BUCKET = "logos";

export async function handleSchools(
  req: Request,
  path: string,
  _url: URL,
): Promise<Response> {
  const method = req.method;
  const db = getDb();

  // GET /schools — public, no auth
  if (path === "/schools" && method === "GET") {
    try {
      const { data } = await db
        .from("schools")
        .select("id, name, logo_url, city, country")
        .order("name");

      // Ensure logo_url is either null or a full URL
      const result = (data || []).map((s: Record<string, unknown>) => ({
        ...s,
        logo_url: s.logo_url
          ? (s.logo_url as string).startsWith("http")
            ? s.logo_url
            : `${SUPABASE_URL()}/storage/v1/object/public/${LOGOS_BUCKET}/${s.logo_url}`
          : null,
      }));

      return json(result);
    } catch (err) {
      console.error("[schools GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}

// handlers/upload.ts — logo upload to Supabase Storage
import { json, getDb, verifyToken, SUPABASE_URL } from "../_shared.ts";

const LOGOS_BUCKET = "logos";

export async function handleUpload(
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

  if (user.role !== "admin" && user.role !== "super_admin")
    return json({ message: "Forbidden" }, 403);

  const db = getDb();

  // POST /upload/logo
  if (path === "/upload/logo" && method === "POST") {
    try {
      const formData = await req.formData();
      const file = formData.get("logo") as File | null;
      if (!file) return json({ message: "logo file is required" }, 400);

      const schoolId = user.school_id as number;
      const ext = file.name.split(".").pop() || "png";
      const storagePath = `${schoolId}/logo_${Date.now()}.${ext}`;
      const buffer = await file.arrayBuffer();

      // Remove old logo if exists
      const { data: school } = await db
        .from("schools")
        .select("logo_url")
        .eq("id", schoolId)
        .single();

      if (school?.logo_url) {
        // Extract path from URL if it's a full storage URL
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
        .upload(storagePath, buffer, {
          contentType: file.type || "image/png",
          upsert: true,
        });

      if (storageError) throw storageError;

      const logo_url = `${SUPABASE_URL()}/storage/v1/object/public/${LOGOS_BUCKET}/${storagePath}`;
      return json({ logo_url });
    } catch (err) {
      console.error("[upload/logo POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}

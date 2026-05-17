// supabase/functions/server/handlers/aiTutorMaterials.ts
// Upload AI study material → record document → enqueue ingestion.
import { getDb, json, verifyToken } from "../_shared.ts";
import { getEffectiveAiAccess, getEffectiveAiAccessForUser } from "../lib/aiScope.ts";
import { processDocument } from "./aiTutorIngestion.ts";

// Deno deploy global for background tasks (defined in Supabase Edge runtime).
declare const EdgeRuntime: { waitUntil?: (p: Promise<unknown>) => void } | undefined;

const ALLOWED_EXT = new Set(["pdf","docx","pptx","ppt","txt"]);
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint", // legacy PPT
  "text/plain",
]);
const MAX_SIZE_BYTES = 25 * 1024 * 1024;

function canUpload(role: string): boolean {
  return ["super_admin","org_admin","admin","teacher"].includes(role);
}

async function resolveScope(role: string, userId: number, body: Record<string, unknown>) {
  const db = getDb();
  const subject_id = Number(body.subject_id);
  const class_id   = body.class_id   ? Number(body.class_id)   : null;
  const section_id = body.section_id ? Number(body.section_id) : null;
  let campus_id    = body.campus_id  ? Number(body.campus_id)  : null;

  if (!subject_id) throw new Error("subject_id required");

  // Resolve campus_id from role context if missing.
  if (!campus_id) {
    if (role === "admin" || role === "teacher") {
      const tbl = role === "admin" ? "admins" : "teachers";
      const { data } = await db.from(tbl).select("school_id").eq("id", userId).maybeSingle();
      campus_id = data?.school_id || null;
    }
  }
  if (!campus_id) throw new Error("campus_id required");

  const { data: campus } = await db.from("schools").select("id, org_id").eq("id", campus_id).maybeSingle();
  if (!campus) throw new Error("Invalid campus");
  const organization_id = campus.org_id;

  // Validate subject belongs to campus
  const { data: subj } = await db.from("subjects").select("id, school_id").eq("id", subject_id).maybeSingle();
  if (!subj || subj.school_id !== campus_id) throw new Error("Subject does not belong to campus");

  if (class_id) {
    const { data: cls } = await db.from("classes").select("id, school_id").eq("id", class_id).maybeSingle();
    if (!cls || cls.school_id !== campus_id) throw new Error("Class does not belong to campus");
  }
  if (section_id) {
    const { data: sec } = await db.from("sections").select("id, class_id").eq("id", section_id).maybeSingle();
    if (!sec || (class_id && sec.class_id !== class_id)) throw new Error("Section invalid for class");
  }

  return { subject_id, class_id, section_id, campus_id, organization_id };
}

export async function handleAiTutorMaterials(req: Request, path: string, _url: URL): Promise<Response> {
  const user = await verifyToken(req).catch(() => null);
  if (!user) return json({ message: "Unauthorized" }, 401);
  const role = String(user.role || "");
  const userId = Number(user.id || 0);
  if (!canUpload(role)) return json({ message: "Forbidden" }, 403);

  const db = getDb();

  if (["org_admin", "admin", "teacher"].includes(role)) {
    const access = await getEffectiveAiAccessForUser(user);
    if (!access.enabled) {
      return json({ message: "AI Tutor disabled", blocked_at: access.blocked_at }, 403);
    }
  }

  // POST /ai-tutor/materials/upload   (multipart/form-data)
  if (path === "/ai-tutor/materials/upload" && req.method === "POST") {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return json({ message: "file required" }, 400);

    const title = String(form.get("title") || "").trim();
    const topic = form.get("topic") ? String(form.get("topic")) : null;
    if (!title) return json({ message: "title required" }, 400);

    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) return json({ message: "Unsupported file extension" }, 400);
    if (!ALLOWED_MIME.has(file.type) && file.type) return json({ message: "Unsupported MIME type" }, 400);
    if (file.size > MAX_SIZE_BYTES) return json({ message: "File too large (max 25MB)" }, 400);

    let scope;
    try {
      scope = await resolveScope(role, userId, {
        subject_id: form.get("subject_id"),
        class_id:   form.get("class_id"),
        section_id: form.get("section_id"),
        campus_id:  form.get("campus_id"),
      });
    } catch (e) {
      return json({ message: (e as Error).message }, 400);
    }

    const targetAccess = await getEffectiveAiAccess({
      role,
      user_id: userId,
      organization_id: scope.organization_id,
      campus_id: scope.campus_id,
      class_id: scope.class_id ?? undefined,
      section_id: scope.section_id ?? undefined,
    });
    if (!targetAccess.enabled) {
      return json({ message: "AI Tutor disabled", blocked_at: targetAccess.blocked_at }, 403);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const checksumBuf = await crypto.subtle.digest("SHA-256", bytes);
    const checksum = Array.from(new Uint8Array(checksumBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

    const storagePath = `org_${scope.organization_id}/campus_${scope.campus_id}/subj_${scope.subject_id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await db.storage.from("ai-materials").upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) return json({ message: `Storage upload failed: ${upErr.message}` }, 500);

    const { data: doc, error: docErr } = await db.from("ai_documents").insert({
      organization_id: scope.organization_id,
      campus_id:       scope.campus_id,
      class_id:        scope.class_id,
      section_id:      scope.section_id,
      subject_id:      scope.subject_id,
      title, topic,
      mime_type: file.type || "application/octet-stream",
      file_ext: ext,
      file_size_bytes: file.size,
      storage_bucket: "ai-materials",
      storage_path: storagePath,
      uploaded_by_role: role,
      uploaded_by_id: userId,
      status: "uploaded",
      checksum_sha256: checksum,
    }).select().single();
    if (docErr) return json({ message: docErr.message }, 500);

    const { data: jobRow } = await db.from("ai_document_jobs").insert({
      document_id: doc.id,
      job_type: "extract",
      status: "running",
      attempt: 1,
    }).select().single();

    // Fire-and-forget ingestion so the document reaches 'ready' without waiting on cron.
    const ingestTask = (async () => {
      try {
        await processDocument(doc.id);
        if (jobRow?.id) {
          await db.from("ai_document_jobs").update({
            status: "done",
            updated_at: new Date().toISOString(),
          }).eq("id", jobRow.id);
        }
      } catch (err) {
        const msg = (err as Error).message || "ingest failed";
        if (jobRow?.id) {
          await db.from("ai_document_jobs").update({
            status: "failed",
            error_message: msg,
            updated_at: new Date().toISOString(),
          }).eq("id", jobRow.id);
        }
        await db.from("ai_documents").update({
          status: "failed",
          error_message: msg,
          updated_at: new Date().toISOString(),
        }).eq("id", doc.id);
        await db.from("ai_usage_logs").insert({
          event_type: "ingest_failed",
          meta: { document_id: doc.id, error: msg },
        });
      }
    })();
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(ingestTask);
    }

    return json({ document: doc });
  }

  // GET /ai-tutor/materials?campus_id=&subject_id=
  if (path === "/ai-tutor/materials" && req.method === "GET") {
    const url = new URL(req.url);
    const campus_id  = url.searchParams.get("campus_id");
    const subject_id = url.searchParams.get("subject_id");
    const class_id   = url.searchParams.get("class_id");

    let q = db.from("ai_documents").select("*").order("created_at", { ascending: false }).limit(500);
    if (campus_id)  q = q.eq("campus_id",  Number(campus_id));
    if (subject_id) q = q.eq("subject_id", Number(subject_id));
    if (class_id)   q = q.eq("class_id",   Number(class_id));

    // Tenant scoping
    if (role === "admin" || role === "teacher") {
      const tbl = role === "admin" ? "admins" : "teachers";
      const { data: u } = await db.from(tbl).select("school_id").eq("id", userId).maybeSingle();
      if (u?.school_id) q = q.eq("campus_id", u.school_id);
    }
    if (role === "org_admin") {
      const { data: u } = await db.from("org_admins").select("org_id").eq("id", userId).maybeSingle();
      if (u?.org_id) q = q.eq("organization_id", u.org_id);
    }

    const { data, error } = await q;
    if (error) return json({ message: error.message }, 500);
    return json({ documents: data });
  }

  // DELETE /ai-tutor/materials/:id
  const delMatch = path.match(/^\/ai-tutor\/materials\/([a-f0-9-]{36})$/);
  if (delMatch && req.method === "DELETE") {
    const id = delMatch[1];
    const { data: doc } = await db
      .from("ai_documents")
      .select("storage_path, storage_bucket, organization_id, campus_id, class_id, section_id")
      .eq("id", id)
      .maybeSingle();
    if (doc) {
      const targetAccess = await getEffectiveAiAccess({
        role,
        user_id: userId,
        organization_id: doc.organization_id,
        campus_id: doc.campus_id,
        class_id: doc.class_id ?? undefined,
        section_id: doc.section_id ?? undefined,
      });
      if (!targetAccess.enabled) {
        return json({ message: "AI Tutor disabled", blocked_at: targetAccess.blocked_at }, 403);
      }
    }
    if (doc?.storage_path) {
      await db.storage.from(doc.storage_bucket || "ai-materials").remove([doc.storage_path]);
    }
    await db.from("ai_documents").delete().eq("id", id);
    return json({ ok: true });
  }

  return json({ message: "Not found" }, 404);
}

// supabase/functions/server/handlers/aiTutorIngestion.ts
// Worker endpoint: processes pending extract/chunk/embed jobs.
// Triggered by Supabase cron OR an authorized super_admin call.
import { getDb, json, verifyToken } from "../_shared.ts";
import { chunkText } from "../lib/aiChunking.ts";
import { embedBatch, hasEmbeddings } from "../lib/aiOpenAI.ts";

const MAX_JOBS_PER_RUN = 5;

async function extractText(bucket: string, storagePath: string, ext: string): Promise<string> {
  const db = getDb();
  const { data, error } = await db.storage.from(bucket).download(storagePath);
  if (error || !data) throw new Error(`download failed: ${error?.message}`);
  const buf = new Uint8Array(await data.arrayBuffer());

  if (ext === "txt") {
    return new TextDecoder("utf-8").decode(buf);
  }
  if (ext === "pdf") {
    // Lightweight: use unpdf which works in Deno.
    const { extractText: pdfExtract, getDocumentProxy } = await import("npm:unpdf@0.12.1");
    const pdf = await getDocumentProxy(buf);
    const { text } = await pdfExtract(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n\n") : String(text || "");
  }
  if (ext === "docx") {
    const mammoth = await import("npm:mammoth@1.7.2");
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value || "";
  }
  if (ext === "pptx") {
    // Best-effort: extract XML text from slide files in the zip.
    const JSZip = (await import("npm:jszip@3.10.1")).default;
    const zip = await JSZip.loadAsync(buf);
    const slidePaths = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
    const parts: string[] = [];
    for (const p of slidePaths) {
      const xml = await zip.files[p].async("string");
      const stripped = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (stripped) parts.push(stripped);
    }
    return parts.join("\n\n");
  }
  throw new Error(`unsupported extension: ${ext}`);
}

export async function processDocument(docId: string): Promise<void> {
  const db = getDb();
  const { data: doc, error } = await db.from("ai_documents").select("*").eq("id", docId).maybeSingle();
  if (error || !doc) throw new Error("document not found");

  await db.from("ai_documents").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", docId);

  const text = await extractText(doc.storage_bucket, doc.storage_path, doc.file_ext);
  if (!text.trim()) throw new Error("empty text extracted");

  const chunks = chunkText(text, { targetTokens: 700, overlapTokens: 120 });
  if (!chunks.length) throw new Error("no chunks produced");

  // Clear existing chunks (idempotent re-ingest)
  await db.from("ai_document_chunks").delete().eq("document_id", docId);

  const withEmbeddings = hasEmbeddings();
  const BATCH = 32;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const embeddings = withEmbeddings
      ? await embedBatch(slice.map((c) => c.content))
      : new Array(slice.length).fill(null);
    const rows = slice.map((c, j) => ({
      document_id: docId,
      organization_id: doc.organization_id,
      campus_id:       doc.campus_id,
      class_id:        doc.class_id,
      section_id:      doc.section_id,
      subject_id:      doc.subject_id,
      chunk_index:     c.index,
      content:         c.content,
      token_count:     c.tokenCount,
      embedding:       withEmbeddings ? (embeddings[j] as unknown as string) : null,
      metadata:        { title: doc.title, topic: doc.topic },
    }));
    const { error: insErr } = await db.from("ai_document_chunks").insert(rows);
    if (insErr) throw new Error(`chunk insert failed: ${insErr.message}`);
  }

  await db.from("ai_documents").update({
    status: "ready",
    error_message: null,
    updated_at: new Date().toISOString(),
  }).eq("id", docId);
}

export async function handleAiTutorIngestion(req: Request, path: string, _url: URL): Promise<Response> {
  // Authorize: super_admin OR shared cron secret header.
  const cronSecret = Deno.env.get("AI_TUTOR_CRON_SECRET");
  const headerSecret = req.headers.get("x-cron-secret");
  const isCron = cronSecret && headerSecret && headerSecret === cronSecret;

  if (!isCron) {
    const user = await verifyToken(req).catch(() => null);
    if (!user || String(user.role) !== "super_admin") return json({ message: "Unauthorized" }, 401);
  }

  const db = getDb();

  if (path === "/ai-tutor/jobs/process-ingestion" && req.method === "POST") {
    // Claim pending extract jobs (simple loop).
    const { data: jobs } = await db
      .from("ai_document_jobs")
      .select("id, document_id, attempt")
      .eq("job_type", "extract")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(MAX_JOBS_PER_RUN);

    const results: Array<{ document_id: string; ok: boolean; error?: string }> = [];
    for (const job of (jobs || []) as Array<{ id: string; document_id: string; attempt: number }>) {
      await db.from("ai_document_jobs").update({ status: "running", attempt: (job.attempt || 0) + 1, updated_at: new Date().toISOString() }).eq("id", job.id);
      try {
        await processDocument(job.document_id);
        await db.from("ai_document_jobs").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", job.id);
        results.push({ document_id: job.document_id, ok: true });
      } catch (err) {
        const msg = (err as Error).message || "ingest failed";
        await db.from("ai_document_jobs").update({ status: "failed", error_message: msg, updated_at: new Date().toISOString() }).eq("id", job.id);
        await db.from("ai_documents").update({ status: "failed", error_message: msg, updated_at: new Date().toISOString() }).eq("id", job.document_id);
        await db.from("ai_usage_logs").insert({
          event_type: "ingest_failed",
          meta: { document_id: job.document_id, error: msg },
        });
        results.push({ document_id: job.document_id, ok: false, error: msg });
      }
    }
    return json({ processed: results.length, results });
  }

  return json({ message: "Not found" }, 404);
}

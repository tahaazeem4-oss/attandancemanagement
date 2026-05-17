// supabase/functions/server/handlers/aiTutorChat.ts
// Student-facing chat endpoints: config, sessions, query, history.
import { getDb, json, verifyToken } from "../_shared.ts";
import { resolveStudentScope, getEffectiveAiAccess, getEffectiveAiAccessForUser } from "../lib/aiScope.ts";
import { getEffectiveQuota, loadQuotaState, assertCanQuery, incrementUsage } from "../lib/aiQuota.ts";
import { enforceRateLimit } from "../lib/aiRateLimit.ts";
import { buildPrompt } from "../lib/aiPrompt.ts";
import { embedText, chatComplete, hasEmbeddings } from "../lib/aiOpenAI.ts";

const MAX_QUESTION_CHARS = 2000;

type RetrievedChunk = {
  chunk_id: string;
  document_id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
};

function toPositiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function queryTerms(question: string): string[] {
  return Array.from(new Set(
    question
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 2),
  ));
}

function scoreSelectedDocumentChunk(question: string, chunk: { content: string; metadata?: Record<string, unknown> }): number {
  const q = question.toLowerCase().trim();
  const title = String(chunk.metadata?.title || "").toLowerCase();
  const topic = String(chunk.metadata?.topic || "").toLowerCase();
  const content = String(chunk.content || "").toLowerCase();
  const searchText = `${title} ${topic} ${content}`;
  let score = 0;
  if (q && searchText.includes(q)) score += 0.35;
  for (const term of queryTerms(question)) {
    if (title.includes(term)) score += 0.14;
    else if (topic.includes(term)) score += 0.12;
    else if (content.includes(term)) score += 0.08;
  }
  return score;
}

async function loadSelectedDocumentChunks(
  db: ReturnType<typeof getDb>,
  params: {
    documentId: string;
    organizationId: number | undefined;
    campusId: number | undefined;
    classId: number | undefined;
    sectionId: number | undefined;
    subjectId: number;
    question: string;
  },
): Promise<RetrievedChunk[]> {
  let q = db
    .from("ai_document_chunks")
    .select("id, document_id, content, metadata, organization_id, campus_id, class_id, section_id, subject_id, chunk_index")
    .eq("document_id", params.documentId)
    .eq("organization_id", params.organizationId)
    .eq("campus_id", params.campusId)
    .eq("subject_id", params.subjectId)
    .order("chunk_index", { ascending: true })
    .limit(50);

  if (params.classId) q = (q as typeof q).or(`class_id.is.null,class_id.eq.${params.classId}`);
  else q = (q as typeof q).is("class_id", null);

  const { data, error } = await (params.sectionId
    ? (q as typeof q).or(`section_id.is.null,section_id.eq.${params.sectionId}`)
    : (q as typeof q).is("section_id", null));
  if (error) throw new Error(error.message);

  const rows = (data || []) as Array<{
    id: string;
    document_id: string;
    content: string;
    metadata: Record<string, unknown> | null;
  }>;
  if (!rows.length) return [];

  const ranked = rows
    .map((row, index) => ({
      chunk_id: row.id,
      document_id: row.document_id,
      content: row.content,
      metadata: row.metadata || {},
      similarity: scoreSelectedDocumentChunk(params.question, { content: row.content, metadata: row.metadata || {} }),
      index,
    }))
    .sort((a, b) => (b.similarity - a.similarity) || (a.index - b.index));

  return ranked.slice(0, Math.min(6, ranked.length));
}

async function resolveStudentFromUser(
  db: ReturnType<typeof getDb>,
  user: Record<string, unknown>,
  url: URL,
): Promise<{ studentId: number | null; unauthorizedParentAccess: boolean }> {
  const role = String(user.role || "");
  if (role === "student") {
    const tokenStudentId = toPositiveInt(user.student_id);
    if (tokenStudentId) return { studentId: tokenStudentId, unauthorizedParentAccess: false };
    // Backward compatibility for old student tokens missing student_id.
    return { studentId: toPositiveInt(user.id), unauthorizedParentAccess: false };
  }

  if (role === "parent") {
    const parentId = toPositiveInt(user.id);
    const requestedStudentId = toPositiveInt(url.searchParams.get("student_id"));
    if (!parentId || !requestedStudentId) {
      return { studentId: null, unauthorizedParentAccess: false };
    }

    const { data: link } = await db
      .from("parent_student")
      .select("id")
      .eq("parent_id", parentId)
      .eq("student_id", requestedStudentId)
      .maybeSingle();

    if (!link) return { studentId: null, unauthorizedParentAccess: true };
    return { studentId: requestedStudentId, unauthorizedParentAccess: false };
  }

  return { studentId: null, unauthorizedParentAccess: false };
}

export async function handleAiTutorChat(req: Request, path: string, url: URL): Promise<Response> {
  const user = await verifyToken(req).catch(() => null);
  if (!user) return json({ message: "Unauthorized" }, 401);

  const db = getDb();

  // GET /ai-tutor/config/effective
  // Students/parents receive quota payload; staff/admin roles receive effective enabled state.
  if (path === "/ai-tutor/config/effective" && req.method === "GET") {
    const role = String(user.role || "");

    if (["super_admin", "org_admin", "admin", "teacher"].includes(role)) {
      const access = await getEffectiveAiAccessForUser(user);
      return json({ enabled: access.enabled, blocked_at: access.blocked_at, scope: access.scope || null });
    }

    const resolvedForConfig = await resolveStudentFromUser(db, user, url);
    if (resolvedForConfig.unauthorizedParentAccess) return json({ message: "Forbidden" }, 403);
    const studentIdForConfig = resolvedForConfig.studentId;
    if (!studentIdForConfig) return json({ message: "Student context required" }, 403);

    const scopeForConfig = await resolveStudentScope(studentIdForConfig);
    if (!scopeForConfig) return json({ message: "Student not found" }, 404);

    const access = await getEffectiveAiAccess(scopeForConfig);
    if (!access.enabled) return json({ enabled: false, blocked_at: access.blocked_at, scope: scopeForConfig });
    const limits = await getEffectiveQuota(scopeForConfig);
    const state  = await loadQuotaState(scopeForConfig, limits);
    return json({ enabled: true, scope: scopeForConfig, quota: state });
  }

  // GET /ai-tutor/student/materials
  // Returns ready ai_documents visible to the student's class (for subject cards and chat material info cards).
  if (path === "/ai-tutor/student/materials" && req.method === "GET") {
    const resolvedMats = await resolveStudentFromUser(db, user, url);
    if (resolvedMats.unauthorizedParentAccess) return json({ message: "Forbidden" }, 403);
    const studentIdMats = resolvedMats.studentId;
    if (!studentIdMats) return json({ message: "Student context required" }, 403);

    const scopeMats = await resolveStudentScope(studentIdMats);
    if (!scopeMats) return json({ message: "Student not found" }, 404);

    const subjectIdParam = url.searchParams.get("subject_id");

    let q = db
      .from("ai_documents")
      .select("id, subject_id, title, topic, uploaded_by_role, uploaded_by_id, created_at, page_count, file_ext, file_size_bytes, status")
      .eq("campus_id", scopeMats.campus_id!)
      .in("status", ["uploaded", "processing", "ready"])
      .order("created_at", { ascending: false })
      .limit(100);

    // Show materials for this class OR campus-wide materials (class_id IS NULL)
    if (scopeMats.class_id) {
      q = (q as any).or(`class_id.is.null,class_id.eq.${scopeMats.class_id}`);
    } else {
      q = (q as any).is("class_id", null);
    }

    if (subjectIdParam) q = (q as any).eq("subject_id", Number(subjectIdParam));

    const { data: docs, error: docsErr } = await (q as any);
    if (docsErr) return json({ message: docsErr.message }, 500);

    // Resolve teacher names for teacher-uploaded materials
    const teacherIds = [
      ...new Set(
        ((docs || []) as any[])
          .filter((d: any) => d.uploaded_by_role === "teacher")
          .map((d: any) => Number(d.uploaded_by_id))
      ),
    ];
    const teacherMap: Record<number, string> = {};
    if (teacherIds.length) {
      const { data: teachers } = await db
        .from("teachers")
        .select("id, first_name, last_name")
        .in("id", teacherIds);
      for (const t of (teachers || []) as any[]) {
        teacherMap[Number(t.id)] = `${t.first_name || ""} ${t.last_name || ""}`.trim();
      }
    }

    // Resolve subject names for all subject_ids present in the docs.
    const subjectIds = [
      ...new Set(((docs || []) as any[]).map((d: any) => Number(d.subject_id)).filter(Boolean)),
    ];
    const subjectMap: Record<number, string> = {};
    if (subjectIds.length) {
      const { data: subs } = await db
        .from("subjects")
        .select("id, name")
        .in("id", subjectIds);
      for (const s of (subs || []) as any[]) {
        subjectMap[Number(s.id)] = String(s.name || "");
      }
    }

    const materials = ((docs || []) as any[]).map((d: any) => ({
      ...d,
      uploaded_by_name: teacherMap[Number(d.uploaded_by_id)] || d.uploaded_by_role,
      subject_name: subjectMap[Number(d.subject_id)] || null,
    }));

    return json({ materials });
  }

  const resolved = await resolveStudentFromUser(db, user, url);
  if (resolved.unauthorizedParentAccess) return json({ message: "Forbidden" }, 403);
  const studentId = resolved.studentId;
  if (!studentId) return json({ message: "Student context required" }, 403);

  const scope = await resolveStudentScope(studentId);
  if (!scope) return json({ message: "Student not found" }, 404);

  // POST /ai-tutor/chat/session
  if (path === "/ai-tutor/chat/session" && req.method === "POST") {
    const access = await getEffectiveAiAccess(scope);
    if (!access.enabled) return json({ message: "AI Tutor disabled", blocked_at: access.blocked_at }, 403);

    const b = await req.json().catch(() => ({}));
    const subject_id = b.subject_id ? Number(b.subject_id) : null;
    const title      = b.title ? String(b.title).slice(0, 120) : null;

    const { data, error } = await db.from("ai_chat_sessions").insert({
      student_id: studentId,
      organization_id: scope.organization_id,
      campus_id:       scope.campus_id,
      class_id:        scope.class_id,
      section_id:      scope.section_id,
      subject_id,
      title,
    }).select().single();
    if (error) return json({ message: error.message }, 500);
    return json({ session: data });
  }

  // GET /ai-tutor/chat/sessions
  if (path === "/ai-tutor/chat/sessions" && req.method === "GET") {
    const { data, error } = await db
      .from("ai_chat_sessions")
      .select("*")
      .eq("student_id", studentId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) return json({ message: error.message }, 500);
    return json({ sessions: data });
  }

  // GET /ai-tutor/chat/history?session_id=
  if (path === "/ai-tutor/chat/history" && req.method === "GET") {
    const url = new URL(req.url);
    const session_id = url.searchParams.get("session_id");
    if (!session_id) return json({ message: "session_id required" }, 400);
    const { data: session } = await db.from("ai_chat_sessions").select("id, student_id").eq("id", session_id).maybeSingle();
    if (!session || session.student_id !== studentId) return json({ message: "Forbidden" }, 403);

    const { data, error } = await db
      .from("ai_chat_messages")
      .select("*")
      .eq("session_id", session_id)
      .order("created_at", { ascending: true });
    if (error) return json({ message: error.message }, 500);
    return json({ messages: data });
  }

  // POST /ai-tutor/chat/query
  if (path === "/ai-tutor/chat/query" && req.method === "POST") {
    const started = Date.now();
    const b = await req.json().catch(() => ({}));
    const question = String(b.question || "").trim();
    const subject_id = b.subject_id ? Number(b.subject_id) : null;
    const document_id = b.document_id ? String(b.document_id) : null;
    let session_id = b.session_id ? String(b.session_id) : null;

    if (!question) return json({ message: "question required" }, 400);
    if (question.length > MAX_QUESTION_CHARS) return json({ message: "question too long" }, 400);
    if (!subject_id) return json({ message: "subject_id required" }, 400);

    const access = await getEffectiveAiAccess(scope);
    if (!access.enabled) {
      await db.from("ai_usage_logs").insert({
        student_id: studentId, organization_id: scope.organization_id, campus_id: scope.campus_id,
        class_id: scope.class_id, section_id: scope.section_id, subject_id,
        event_type: "blocked_scope", meta: { blocked_at: access.blocked_at },
      });
      return json({ message: "AI Tutor disabled", blocked_at: access.blocked_at }, 403);
    }

    const rl = await enforceRateLimit(`student:${studentId}`);
    if (!rl.ok) {
      await db.from("ai_usage_logs").insert({
        student_id: studentId, organization_id: scope.organization_id, campus_id: scope.campus_id,
        event_type: "blocked_rate_limit", meta: { reason: rl.reason },
      });
      return json({ message: rl.reason || "Rate limit" }, 429);
    }

    const limits = await getEffectiveQuota(scope);
    if (limits.max_input_tokens && question.length / 4 > limits.max_input_tokens) {
      return json({ message: "Question exceeds allowed input length" }, 400);
    }
    const state = await loadQuotaState(scope, limits);
    const check = assertCanQuery(state);
    if (!check.ok) {
      await db.from("ai_usage_logs").insert({
        student_id: studentId, organization_id: scope.organization_id, campus_id: scope.campus_id,
        class_id: scope.class_id, section_id: scope.section_id, subject_id,
        event_type: "blocked_quota", meta: { reason: check.reason },
      });
      return json({ message: check.reason || "Quota exceeded" }, 429);
    }

    // Ensure session
    if (!session_id) {
      const { data: s } = await db.from("ai_chat_sessions").insert({
        student_id: studentId,
        organization_id: scope.organization_id,
        campus_id: scope.campus_id,
        class_id: scope.class_id,
        section_id: scope.section_id,
        subject_id,
        title: question.slice(0, 80),
      }).select().single();
      session_id = s!.id;
    }

    let usableChunks: RetrievedChunk[] = [];
    if (document_id) {
      try {
        usableChunks = await loadSelectedDocumentChunks(db, {
          documentId: document_id,
          organizationId: scope.organization_id,
          campusId: scope.campus_id,
          classId: scope.class_id,
          sectionId: scope.section_id,
          subjectId: subject_id,
          question,
        });
      } catch (err) {
        return json({ message: `Search failed: ${(err as Error).message}` }, 500);
      }
    } else {
      // Retrieve scoped chunks: vector search when embeddings available, else FTS.
      const useVectors = hasEmbeddings();
      let queryEmbedding: number[] | null = null;
      if (useVectors) {
        try {
          queryEmbedding = await embedText(question);
        } catch (err) {
          return json({ message: `Embedding failed: ${(err as Error).message}` }, 502);
        }
      }

      const { data: matches, error: matchErr } = useVectors
        ? await db.rpc("match_ai_chunks", {
            p_query_embedding: queryEmbedding as unknown as string,
            p_org_id: scope.organization_id,
            p_campus_id: scope.campus_id,
            p_class_id: scope.class_id ?? null,
            p_section_id: scope.section_id ?? null,
            p_subject_id: subject_id,
            p_match_count: 8,
          })
        : await db.rpc("match_ai_chunks_fts", {
            p_query: question,
            p_org_id: scope.organization_id,
            p_campus_id: scope.campus_id,
            p_class_id: scope.class_id ?? null,
            p_section_id: scope.section_id ?? null,
            p_subject_id: subject_id,
            p_match_count: 8,
          });
      if (matchErr) return json({ message: `Search failed: ${matchErr.message}` }, 500);

      const chunks = (matches || []) as RetrievedChunk[];
      // Vector cosine sim threshold ~0.20; FTS ts_rank threshold ~0 (any match).
      const simThreshold = useVectors ? 0.20 : 0.0001;
      usableChunks = chunks.filter((c) => (c.similarity ?? 0) >= simThreshold);
    }

    // Save user message
    await db.from("ai_chat_messages").insert({
      session_id, role: "user", content: question,
    });

    if (!usableChunks.length) {
      const refusal = "I could not find this in your uploaded study material. Please review the relevant chapter or ask your teacher to upload the material.";
      const { data: msg } = await db.from("ai_chat_messages").insert({
        session_id, role: "assistant", content: refusal, citations: [],
      }).select().single();
      await db.from("ai_usage_logs").insert({
        student_id: studentId, session_id, message_id: msg?.id,
        organization_id: scope.organization_id, campus_id: scope.campus_id,
        class_id: scope.class_id, section_id: scope.section_id, subject_id,
        event_type: "no_context", request_chars: question.length, retrieved_chunks: 0,
        latency_ms: Date.now() - started,
      });
      return json({ session_id, answer: refusal, citations: [] });
    }

    // Build prompt + ask LLM
    const prompt = buildPrompt({
      question,
      chunks: usableChunks,
      className: scope.class_name,
      sectionName: scope.section_name,
    });
    const maxOut = limits.max_output_tokens || 700;
    let llm;
    try {
      llm = await chatComplete(prompt.system, prompt.user, maxOut);
    } catch (err) {
      return json({ message: `LLM call failed: ${(err as Error).message}` }, 502);
    }

    // Build citation payload
    const citations = Object.entries(prompt.citationMap).map(([tag, chunk_id]) => {
      const c = usableChunks.find((x) => x.chunk_id === chunk_id);
      return { tag, chunk_id, document_id: c?.document_id, similarity: c?.similarity, snippet: c?.content?.slice(0, 200) };
    });

    const { data: aMsg } = await db.from("ai_chat_messages").insert({
      session_id, role: "assistant", content: llm.text, citations,
      model: llm.model, prompt_tokens: llm.prompt_tokens, completion_tokens: llm.completion_tokens,
    }).select().single();

    await db.from("ai_chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", session_id);

    await incrementUsage(studentId, llm.total_tokens || (llm.prompt_tokens + llm.completion_tokens));

    await db.from("ai_usage_logs").insert({
      student_id: studentId, session_id, message_id: aMsg?.id,
      organization_id: scope.organization_id, campus_id: scope.campus_id,
      class_id: scope.class_id, section_id: scope.section_id, subject_id,
      event_type: "query", request_chars: question.length,
      retrieved_chunks: usableChunks.length, model: llm.model,
      prompt_tokens: llm.prompt_tokens, completion_tokens: llm.completion_tokens, total_tokens: llm.total_tokens,
      latency_ms: Date.now() - started,
    });

    return json({ session_id, answer: llm.text, citations });
  }

  return json({ message: "Not found" }, 404);
}

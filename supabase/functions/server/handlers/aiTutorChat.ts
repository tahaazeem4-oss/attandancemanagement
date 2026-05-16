// supabase/functions/server/handlers/aiTutorChat.ts
// Student-facing chat endpoints: config, sessions, query, history.
import { getDb, json, verifyToken } from "../_shared.ts";
import { resolveStudentScope, getEffectiveAiAccess } from "../lib/aiScope.ts";
import { getEffectiveQuota, loadQuotaState, assertCanQuery, incrementUsage } from "../lib/aiQuota.ts";
import { enforceRateLimit } from "../lib/aiRateLimit.ts";
import { buildPrompt } from "../lib/aiPrompt.ts";
import { embedText, chatComplete } from "../lib/aiOpenAI.ts";

const MAX_QUESTION_CHARS = 2000;

async function resolveStudentFromUser(user: Record<string, unknown>): Promise<number | null> {
  const role = String(user.role || "");
  if (role === "student") return Number(user.id);
  // Parent acting on behalf of student: expect student_id in token (existing parent flow).
  if (role === "parent" && user.student_id) return Number(user.student_id);
  return null;
}

export async function handleAiTutorChat(req: Request, path: string, _url: URL): Promise<Response> {
  const user = await verifyToken(req).catch(() => null);
  if (!user) return json({ message: "Unauthorized" }, 401);

  const studentId = await resolveStudentFromUser(user);
  if (!studentId) return json({ message: "Student context required" }, 403);

  const scope = await resolveStudentScope(studentId);
  if (!scope) return json({ message: "Student not found" }, 404);

  const db = getDb();

  // GET /ai-tutor/config/effective
  if (path === "/ai-tutor/config/effective" && req.method === "GET") {
    const access = await getEffectiveAiAccess(scope);
    if (!access.enabled) return json({ enabled: false, blocked_at: access.blocked_at });
    const limits = await getEffectiveQuota(scope);
    const state  = await loadQuotaState(scope, limits);
    return json({ enabled: true, scope, quota: state });
  }

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

    // Embed question
    let queryEmbedding: number[];
    try {
      queryEmbedding = await embedText(question);
    } catch (err) {
      return json({ message: `Embedding failed: ${(err as Error).message}` }, 502);
    }

    // Retrieve scoped chunks
    const { data: matches, error: matchErr } = await db.rpc("match_ai_chunks", {
      p_query_embedding: queryEmbedding as unknown as string,
      p_org_id: scope.organization_id,
      p_campus_id: scope.campus_id,
      p_class_id: scope.class_id ?? null,
      p_section_id: scope.section_id ?? null,
      p_subject_id: subject_id,
      p_match_count: 8,
    });
    if (matchErr) return json({ message: `Search failed: ${matchErr.message}` }, 500);

    const chunks = (matches || []) as Array<{ chunk_id: string; document_id: string; content: string; similarity: number; metadata: Record<string, unknown> }>;
    const usableChunks = chunks.filter((c) => c.similarity >= 0.20);

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

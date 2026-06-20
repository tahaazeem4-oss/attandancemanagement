// supabase/functions/server/lib/aiCache.ts
// Semantic-exact answer cache keyed by (normalised question + campus + subject + document set).
// Cache hits return the stored answer without calling the LLM — no quota or tokens consumed.

// deno-lint-ignore no-explicit-any
type DB = any;

export interface CachedAnswer {
  id: string;
  answer: string;
  citations: unknown[];
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
}

/**
 * Normalise a question for cache key generation:
 * - lowercase
 * - collapse whitespace
 * - strip trailing punctuation
 */
function normaliseQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[?!.,;:]+$/, "")
    .trim();
}

/**
 * Build a stable cache key from the question + context.
 * Uses SubtleCrypto SHA-256 (available in Deno / browser runtimes).
 *
 * Key input: "<normalised_question>|<campus_id>|<subject_id>|<sorted_doc_ids>"
 */
export async function buildCacheKey(
  question: string,
  campusId: number,
  subjectId: number,
  documentIds: string[],
): Promise<string> {
  const sortedDocs = [...documentIds].sort().join(",");
  const raw = `${normaliseQuestion(question)}|${campusId}|${subjectId}|${sortedDocs}`;
  const encoded = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Look up a cache entry. Returns null on miss or if entry is expired.
 */
export async function getCachedAnswer(
  db: DB,
  cacheKey: string,
): Promise<CachedAnswer | null> {
  const { data, error } = await db
    .from("ai_answer_cache")
    .select("id, answer, citations, model, prompt_tokens, completion_tokens, total_tokens, expires_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error || !data) return null;

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    // Expired — delete in background, return null
    db.from("ai_answer_cache").delete().eq("id", data.id).then(() => {});
    return null;
  }

  // Update hit stats in background (don't await — don't slow the response)
  db.from("ai_answer_cache")
    .update({ hit_count: (data.hit_count ?? 0) + 1, last_hit_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return {
    id: data.id,
    answer: data.answer,
    citations: data.citations ?? [],
    model: data.model ?? null,
    prompt_tokens: data.prompt_tokens ?? null,
    completion_tokens: data.completion_tokens ?? null,
    total_tokens: data.total_tokens ?? null,
  };
}

/**
 * Store an LLM answer in the cache.
 * Silently ignores errors (cache is best-effort).
 */
export async function setCachedAnswer(
  db: DB,
  params: {
    cacheKey: string;
    question: string;
    campusId: number;
    subjectId: number;
    answer: string;
    citations: unknown[];
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  },
): Promise<void> {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db
    .from("ai_answer_cache")
    .upsert(
      {
        cache_key:         params.cacheKey,
        question:          params.question.slice(0, 2000),
        campus_id:         params.campusId,
        subject_id:        params.subjectId,
        answer:            params.answer,
        citations:         params.citations,
        model:             params.model,
        prompt_tokens:     params.promptTokens,
        completion_tokens: params.completionTokens,
        total_tokens:      params.totalTokens,
        hit_count:         0,
        expires_at:        expiresAt,
        created_at:        new Date().toISOString(),
      },
      { onConflict: "cache_key", ignoreDuplicates: true },
    )
    .catch(() => {}); // best-effort
}

/**
 * Invalidate all cache entries for a given campus + subject.
 * Call this when new material is uploaded so stale answers are evicted.
 */
export async function invalidateCacheForSubject(
  db: DB,
  campusId: number,
  subjectId: number,
): Promise<void> {
  await db
    .from("ai_answer_cache")
    .delete()
    .eq("campus_id", campusId)
    .eq("subject_id", subjectId)
    .catch(() => {});
}

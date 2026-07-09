// supabase/functions/server/lib/aiOpenAI.ts
// LLM client. Chat goes through OpenRouter (OpenAI-compatible) when
// OPENROUTER_API_KEY is set, otherwise falls back to OpenAI.
// Embeddings only work when OPENAI_API_KEY is present (OpenRouter has no
// /embeddings endpoint); callers should treat missing embeddings as a
// trigger to use the FTS retrieval path.

const OPENAI_BASE     = "https://api.openai.com/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

function openaiKey(): string | null {
  return Deno.env.get("OPENAI_API_KEY") || null;
}
function openrouterKey(): string | null {
  return Deno.env.get("OPENROUTER_API_KEY") || null;
}

/** True when chat goes through OpenRouter (no embeddings available). */
export function isOpenRouter(): boolean {
  return !!openrouterKey();
}

/** True when embeddings/vector search are available. */
export function hasEmbeddings(): boolean {
  return !!openaiKey();
}

export const EMBED_MODEL = Deno.env.get("OPENAI_EMBED_MODEL") || "text-embedding-3-small";
export const CHAT_MODEL  =
  Deno.env.get("OPENROUTER_MODEL") ||
  Deno.env.get("OPENAI_CHAT_MODEL") ||
  (isOpenRouter() ? "openai/gpt-4o-mini" : "gpt-4o-mini");

export async function embedText(text: string): Promise<number[]> {
  const k = openaiKey();
  if (!k) throw new Error("OPENAI_API_KEY not configured (embeddings unavailable)");
  const res = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${k}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`Embedding failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return j.data[0].embedding as number[];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const k = openaiKey();
  if (!k) throw new Error("OPENAI_API_KEY not configured (embeddings unavailable)");
  const res = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${k}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`Embedding batch failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return (j.data as Array<{ embedding: number[] }>).map((d) => d.embedding);
}

export interface ChatResult {
  text: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  model: string;
}

export async function chatComplete(system: string, user: string, maxOutputTokens = 700): Promise<ChatResult> {
  const useOR = isOpenRouter();
  const base  = useOR ? OPENROUTER_BASE : OPENAI_BASE;
  const key   = useOR ? openrouterKey() : openaiKey();
  if (!key) throw new Error(useOR ? "OPENROUTER_API_KEY missing" : "OPENAI_API_KEY missing");

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (useOR) {
    headers["HTTP-Referer"] = Deno.env.get("OPENROUTER_REFERER") || "https://school-ai-tutor.local";
    headers["X-Title"]      = Deno.env.get("OPENROUTER_TITLE")   || "School AI Tutor";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: 0.2,
        max_tokens: maxOutputTokens,
        messages: [
          // cache_control tells OpenRouter/Anthropic to cache this system prompt.
          // For OpenAI models via OpenRouter, prompt caching is automatic.
          { role: "system", content: [
            { type: "text", text: system, cache_control: { type: "ephemeral" } },
          ]},
          { role: "user", content: user },
        ],
      }),
    });
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    const name = (fetchErr as Error).name;
    if (name === "AbortError") throw new Error("AI model request timed out after 30s. Please try again.");
    throw fetchErr;
  }
  clearTimeout(timeoutId);
  if (!res.ok) throw new Error(`Chat completion failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  const choice = j.choices?.[0];
  return {
    text: choice?.message?.content || "",
    prompt_tokens: j.usage?.prompt_tokens || 0,
    completion_tokens: j.usage?.completion_tokens || 0,
    total_tokens: j.usage?.total_tokens || 0,
    model: j.model || CHAT_MODEL,
  };
}

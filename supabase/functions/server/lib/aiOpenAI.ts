// supabase/functions/server/lib/aiOpenAI.ts
// Thin OpenAI wrapper for embeddings + chat completions.

const OPENAI_BASE = "https://api.openai.com/v1";

function apiKey(): string {
  const k = Deno.env.get("OPENAI_API_KEY");
  if (!k) throw new Error("OPENAI_API_KEY not configured");
  return k;
}

export const EMBED_MODEL = Deno.env.get("OPENAI_EMBED_MODEL") || "text-embedding-3-small";
export const CHAT_MODEL  = Deno.env.get("OPENAI_CHAT_MODEL")  || "gpt-4o-mini";

export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`Embedding failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return j.data[0].embedding as number[];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const res = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey()}`, "Content-Type": "application/json" },
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
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.2,
      max_tokens: maxOutputTokens,
      messages: [
        { role: "system", content: system },
        { role: "user",   content: user },
      ],
    }),
  });
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

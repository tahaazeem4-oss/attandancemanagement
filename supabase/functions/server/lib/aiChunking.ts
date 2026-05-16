// supabase/functions/server/lib/aiChunking.ts
// Simple, deterministic text chunking with overlap.

export interface Chunk {
  index: number;
  content: string;
  tokenCount: number; // approximate
}

function approxTokens(text: string): number {
  // Rough heuristic: 1 token ≈ 4 chars of English text.
  return Math.max(1, Math.ceil(text.length / 4));
}

export function chunkText(input: string, opts?: { targetTokens?: number; overlapTokens?: number }): Chunk[] {
  const target = opts?.targetTokens ?? 700;
  const overlap = opts?.overlapTokens ?? 120;
  const targetChars = target * 4;
  const overlapChars = overlap * 4;

  const clean = input.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];

  // Split on paragraph boundaries first
  const paragraphs = clean.split(/\n{2,}/);
  const chunks: Chunk[] = [];
  let buf = "";
  let idx = 0;

  const push = () => {
    const text = buf.trim();
    if (!text) return;
    chunks.push({ index: idx++, content: text, tokenCount: approxTokens(text) });
    // overlap tail
    buf = overlapChars > 0 && text.length > overlapChars ? text.slice(-overlapChars) : "";
  };

  for (const p of paragraphs) {
    if ((buf + "\n\n" + p).length > targetChars && buf.length > 0) {
      push();
    }
    buf = buf ? `${buf}\n\n${p}` : p;
    while (buf.length > targetChars * 1.4) {
      // very long paragraph: hard split
      const cut = buf.slice(0, targetChars);
      chunks.push({ index: idx++, content: cut.trim(), tokenCount: approxTokens(cut) });
      buf = buf.slice(targetChars - overlapChars);
    }
  }
  if (buf.trim()) push();
  return chunks;
}

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

function normalizeExtractedText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\u001f/g, "\n\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001e\u007f]/g, " ")
    .replace(/(\d{4}\/\d{1,2}\/\d{1,2})/g, "\n\n$1\n")
    .replace(/([.!?])\s+(?=[A-Z][a-z])/g, "$1\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLongParagraph(paragraph: string, targetChars: number): string[] {
  if (paragraph.length <= targetChars * 1.2) return [paragraph.trim()];

  const sentenceParts = paragraph
    .split(/(?<=[.!?])\s+|(?<=:)\s+(?=[A-Z0-9])|\s+(?=\d+\.\s)/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentenceParts.length <= 1) return [paragraph.trim()];

  const out: string[] = [];
  let buf = "";
  for (const part of sentenceParts) {
    const next = buf ? `${buf} ${part}` : part;
    if (next.length > targetChars && buf) {
      out.push(buf.trim());
      buf = part;
    } else {
      buf = next;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.length ? out : [paragraph.trim()];
}

export function chunkText(input: string, opts?: { targetTokens?: number; overlapTokens?: number }): Chunk[] {
  const target = opts?.targetTokens ?? 700;
  const overlap = opts?.overlapTokens ?? 120;
  const targetChars = target * 4;
  const overlapChars = overlap * 4;

  const clean = normalizeExtractedText(input);
  if (!clean) return [];

  // Split on paragraph boundaries first
  const paragraphs = clean
    .split(/\n{2,}/)
    .flatMap((paragraph) => splitLongParagraph(paragraph, targetChars))
    .filter(Boolean);
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
      const sentenceCut = buf.slice(0, targetChars).match(/^([\s\S]{0,2800}[.!?])\s/);
      const cut = sentenceCut?.[1] || buf.slice(0, targetChars);
      chunks.push({ index: idx++, content: cut.trim(), tokenCount: approxTokens(cut) });
      buf = buf.slice(Math.max(0, cut.length - overlapChars));
    }
  }
  if (buf.trim()) push();
  return chunks;
}

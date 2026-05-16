// supabase/functions/server/lib/aiRateLimit.ts
// Sliding-window rate limiting backed by ai_rate_limit_buckets.
import { getDb } from "../_shared.ts";

export interface RateLimitRule {
  windowSeconds: number;
  maxRequests: number;
  keySuffix: string;
}

const DEFAULT_RULES: RateLimitRule[] = [
  { windowSeconds: 60,   maxRequests: 10, keySuffix: "1m" },
  { windowSeconds: 3600, maxRequests: 60, keySuffix: "1h" },
];

export async function enforceRateLimit(identity: string, rules: RateLimitRule[] = DEFAULT_RULES): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb();
  const now = new Date();
  for (const r of rules) {
    const key = `${identity}:${r.keySuffix}`;
    const { data: row } = await db
      .from("ai_rate_limit_buckets")
      .select("key, window_start, count")
      .eq("key", key)
      .maybeSingle();

    const windowStart = row ? new Date(row.window_start) : null;
    const ageSec = windowStart ? (now.getTime() - windowStart.getTime()) / 1000 : Infinity;

    if (!row || ageSec >= r.windowSeconds) {
      await db.from("ai_rate_limit_buckets").upsert({
        key,
        window_start: now.toISOString(),
        count: 1,
        updated_at: now.toISOString(),
      });
      continue;
    }
    if (row.count >= r.maxRequests) {
      return { ok: false, reason: `Rate limit exceeded (${r.keySuffix})` };
    }
    await db.from("ai_rate_limit_buckets")
      .update({ count: row.count + 1, updated_at: now.toISOString() })
      .eq("key", key);
  }
  return { ok: true };
}

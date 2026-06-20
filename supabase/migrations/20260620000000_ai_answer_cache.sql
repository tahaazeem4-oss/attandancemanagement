-- AI Answer Cache
-- Stores LLM responses keyed by a hash of the question + context (campus, subject, document set).
-- Cache hits skip the LLM call entirely — no quota or tokens consumed.

CREATE TABLE IF NOT EXISTS ai_answer_cache (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Cache key: SHA-256 hex of (normalised_question || campus_id || subject_id || sorted_document_ids)
  cache_key        TEXT        NOT NULL UNIQUE,
  -- Stored so admins can see what question produced this entry
  question         TEXT        NOT NULL,
  campus_id        INTEGER     NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id       INTEGER     NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  -- The cached answer and citation metadata
  answer           TEXT        NOT NULL,
  citations        JSONB       NOT NULL DEFAULT '[]',
  -- Token stats from the original LLM call
  model            TEXT,
  prompt_tokens    INTEGER,
  completion_tokens INTEGER,
  total_tokens     INTEGER,
  -- Freshness tracking
  hit_count        INTEGER     NOT NULL DEFAULT 0,
  last_hit_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Auto-expire cache entries after 30 days so stale material doesn't persist
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_ai_answer_cache_campus_subject
  ON ai_answer_cache (campus_id, subject_id);

CREATE INDEX IF NOT EXISTS idx_ai_answer_cache_expires
  ON ai_answer_cache (expires_at);

-- RLS: Edge Function service role only
ALTER TABLE ai_answer_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_ai_answer_cache') THEN
    CREATE POLICY deny_all_ai_answer_cache ON ai_answer_cache FOR ALL USING (false) WITH CHECK (false);
  END IF;
END $$;

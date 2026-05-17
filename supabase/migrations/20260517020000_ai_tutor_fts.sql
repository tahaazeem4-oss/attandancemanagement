-- ============================================================
--  AI Tutor — Full-text search fallback (when no embedding provider)
-- ============================================================

BEGIN;

-- 1) Allow chunks without embeddings (OpenRouter has no /embeddings endpoint).
ALTER TABLE ai_document_chunks
  ALTER COLUMN embedding DROP NOT NULL;

-- 2) Generated tsvector for keyword search.
ALTER TABLE ai_document_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_ai_chunks_content_tsv
  ON ai_document_chunks USING GIN (content_tsv);

-- 3) FTS retrieval RPC (mirrors match_ai_chunks signature, no embedding).
CREATE OR REPLACE FUNCTION match_ai_chunks_fts(
  p_query        TEXT,
  p_org_id       INTEGER,
  p_campus_id    INTEGER,
  p_class_id     INTEGER,
  p_section_id   INTEGER,
  p_subject_id   INTEGER,
  p_match_count  INTEGER DEFAULT 8
)
RETURNS TABLE (
  chunk_id    UUID,
  document_id UUID,
  content     TEXT,
  similarity  DOUBLE PRECISION,
  metadata    JSONB
)
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('english', coalesce(p_query, '')) AS tsq
  )
  SELECT
    c.id,
    c.document_id,
    c.content,
    ts_rank(c.content_tsv, q.tsq)::DOUBLE PRECISION AS similarity,
    c.metadata
  FROM ai_document_chunks c
  JOIN ai_documents d ON d.id = c.document_id
  CROSS JOIN q
  WHERE d.status = 'ready'
    AND c.organization_id = p_org_id
    AND c.campus_id       = p_campus_id
    AND c.subject_id      = p_subject_id
    AND (c.class_id   IS NULL OR p_class_id   IS NULL OR c.class_id   = p_class_id)
    AND (c.section_id IS NULL OR p_section_id IS NULL OR c.section_id = p_section_id)
    AND (q.tsq IS NULL OR q.tsq = ''::tsquery OR c.content_tsv @@ q.tsq)
  ORDER BY ts_rank(c.content_tsv, q.tsq) DESC, c.created_at DESC
  LIMIT GREATEST(p_match_count, 1);
$$;

COMMIT;

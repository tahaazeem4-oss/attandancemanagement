-- ============================================================
--  AI Tutor — Relaxed FTS retrieval for OpenRouter fallback
-- ============================================================

BEGIN;

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
    SELECT
      trim(coalesce(p_query, '')) AS qtxt,
      websearch_to_tsquery('english', trim(coalesce(p_query, ''))) AS strict_tsq,
      ARRAY(
        SELECT cleaned
        FROM (
          SELECT regexp_replace(lower(tok), '[^a-z0-9]+', '', 'g') AS cleaned
          FROM unnest(regexp_split_to_array(trim(coalesce(p_query, '')), '\s+')) AS tok
        ) t
        WHERE length(cleaned) >= 2
      ) AS terms
  ),
  base AS (
    SELECT
      c.id,
      c.document_id,
      c.content,
      c.metadata,
      c.created_at,
      (
        coalesce(c.content_tsv, to_tsvector('english', coalesce(c.content, '')))
        ||
        setweight(
          to_tsvector(
            'english',
            coalesce(c.metadata->>'title', '') || ' ' || coalesce(c.metadata->>'topic', '')
          ),
          'B'
        )
      ) AS search_tsv,
      lower(
        coalesce(c.content, '') || ' ' ||
        coalesce(c.metadata->>'title', '') || ' ' ||
        coalesce(c.metadata->>'topic', '')
      ) AS search_text
    FROM ai_document_chunks c
    JOIN ai_documents d ON d.id = c.document_id
    WHERE d.status = 'ready'
      AND c.organization_id = p_org_id
      AND c.campus_id       = p_campus_id
      AND c.subject_id      = p_subject_id
      AND (c.class_id   IS NULL OR p_class_id   IS NULL OR c.class_id   = p_class_id)
      AND (c.section_id IS NULL OR p_section_id IS NULL OR c.section_id = p_section_id)
  ),
  scored AS (
    SELECT
      b.id,
      b.document_id,
      b.content,
      b.metadata,
      b.created_at,
      (
        CASE
          WHEN q.strict_tsq IS NULL OR q.strict_tsq = ''::tsquery THEN 0
          ELSE ts_rank(b.search_tsv, q.strict_tsq)
        END
        +
        coalesce((
          SELECT count(*)::DOUBLE PRECISION * 0.05
          FROM unnest(q.terms) AS term
          WHERE term <> '' AND b.search_text LIKE '%' || term || '%'
        ), 0)
      )::DOUBLE PRECISION AS score,
      (
        (q.strict_tsq IS NOT NULL AND q.strict_tsq <> ''::tsquery AND b.search_tsv @@ q.strict_tsq)
        OR EXISTS (
          SELECT 1
          FROM unnest(q.terms) AS term
          WHERE term <> '' AND b.search_text LIKE '%' || term || '%'
        )
      ) AS matched
    FROM base b
    CROSS JOIN q
  )
  SELECT
    id,
    document_id,
    content,
    score AS similarity,
    metadata
  FROM scored
  WHERE matched
  ORDER BY score DESC, created_at DESC
  LIMIT GREATEST(p_match_count, 1);
$$;

COMMIT;

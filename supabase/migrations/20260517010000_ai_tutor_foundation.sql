-- ============================================================
--  AI Tutor — Foundation Schema
--  Multi-tenant scoped RAG tutor for the school management system.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1) Scoped feature flags ─────────────────────────────────
-- scope_type: global | organization | campus | class | section | student
-- scope_id is NULL for global, otherwise references the relevant entity id.
CREATE TABLE IF NOT EXISTS ai_feature_flags (
  id              BIGSERIAL PRIMARY KEY,
  scope_type      TEXT NOT NULL CHECK (scope_type IN ('global','organization','campus','class','section','student')),
  scope_id        INTEGER,
  is_enabled      BOOLEAN NOT NULL,
  reason          TEXT,
  updated_by_role TEXT NOT NULL,
  updated_by_id   INTEGER NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_feature_flags_scope_unique UNIQUE (scope_type, scope_id),
  CONSTRAINT ai_feature_flags_scope_id_chk CHECK (
    (scope_type = 'global' AND scope_id IS NULL) OR
    (scope_type <> 'global' AND scope_id IS NOT NULL)
  )
);

-- ── 2) Scoped quota policies ────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_quota_policies (
  id                BIGSERIAL PRIMARY KEY,
  scope_type        TEXT NOT NULL CHECK (scope_type IN ('global','organization','campus','class','section','student')),
  scope_id          INTEGER,
  daily_requests    INTEGER,
  weekly_requests   INTEGER,
  monthly_requests  INTEGER,
  daily_tokens      INTEGER,
  weekly_tokens     INTEGER,
  monthly_tokens    INTEGER,
  max_input_tokens  INTEGER,
  max_output_tokens INTEGER,
  updated_by_role   TEXT NOT NULL,
  updated_by_id     INTEGER NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_quota_policies_scope_unique UNIQUE (scope_type, scope_id),
  CONSTRAINT ai_quota_policies_scope_id_chk CHECK (
    (scope_type = 'global' AND scope_id IS NULL) OR
    (scope_type <> 'global' AND scope_id IS NOT NULL)
  )
);

-- ── 3) Uploaded source documents ─────────────────────────────
CREATE TABLE IF NOT EXISTS ai_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campus_id         INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id          INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  section_id        INTEGER REFERENCES sections(id) ON DELETE SET NULL,
  subject_id        INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  topic             TEXT,
  mime_type         TEXT NOT NULL,
  file_ext          TEXT NOT NULL,
  file_size_bytes   BIGINT NOT NULL,
  storage_bucket    TEXT NOT NULL DEFAULT 'ai-materials',
  storage_path      TEXT NOT NULL,
  uploaded_by_role  TEXT NOT NULL CHECK (uploaded_by_role IN ('super_admin','org_admin','admin','teacher')),
  uploaded_by_id    INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','processing','ready','failed','archived')),
  checksum_sha256   TEXT,
  page_count        INTEGER,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4) Ingestion jobs ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_document_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES ai_documents(id) ON DELETE CASCADE,
  job_type      TEXT NOT NULL CHECK (job_type IN ('extract','chunk','embed')),
  status        TEXT NOT NULL CHECK (status IN ('pending','running','done','failed')),
  attempt       INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5) Document chunks with embeddings ──────────────────────
CREATE TABLE IF NOT EXISTS ai_document_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES ai_documents(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL,
  campus_id       INTEGER NOT NULL,
  class_id        INTEGER,
  section_id      INTEGER,
  subject_id      INTEGER NOT NULL,
  chunk_index     INTEGER NOT NULL,
  content         TEXT NOT NULL,
  token_count     INTEGER NOT NULL,
  embedding       vector(1536) NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, chunk_index)
);

-- ── 6) Chat sessions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campus_id       INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id        INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  section_id      INTEGER REFERENCES sections(id) ON DELETE SET NULL,
  subject_id      INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  title           TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7) Chat messages ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content           TEXT NOT NULL,
  citations         JSONB,
  model             TEXT,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  cost_usd          NUMERIC(12,6),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 8) Quota counters by period ─────────────────────────────
CREATE TABLE IF NOT EXISTS ai_quota_counters (
  id             BIGSERIAL PRIMARY KEY,
  student_id     INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  period_type    TEXT NOT NULL CHECK (period_type IN ('daily','weekly','monthly')),
  period_start   DATE NOT NULL,
  used_requests  INTEGER NOT NULL DEFAULT 0,
  used_tokens    INTEGER NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, period_type, period_start)
);

-- ── 9) Usage / audit ledger ─────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id                BIGSERIAL PRIMARY KEY,
  student_id        INTEGER REFERENCES students(id) ON DELETE SET NULL,
  session_id        UUID REFERENCES ai_chat_sessions(id) ON DELETE SET NULL,
  message_id        UUID REFERENCES ai_chat_messages(id) ON DELETE SET NULL,
  organization_id   INTEGER,
  campus_id         INTEGER,
  class_id          INTEGER,
  section_id        INTEGER,
  subject_id        INTEGER,
  event_type        TEXT NOT NULL CHECK (event_type IN ('query','blocked_quota','blocked_scope','blocked_rate_limit','no_context','ingest','ingest_failed')),
  request_chars     INTEGER,
  retrieved_chunks  INTEGER,
  model             TEXT,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  total_tokens      INTEGER,
  cost_usd          NUMERIC(12,6),
  latency_ms        INTEGER,
  ip_hash           TEXT,
  device_hash       TEXT,
  meta              JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 10) Rate-limit buckets ──────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_rate_limit_buckets (
  key          TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ai_docs_scope_subject
  ON ai_documents (organization_id, campus_id, class_id, section_id, subject_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_docs_status
  ON ai_documents (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_chunks_scope_subject
  ON ai_document_chunks (organization_id, campus_id, class_id, section_id, subject_id);

CREATE INDEX IF NOT EXISTS idx_ai_chunks_doc
  ON ai_document_chunks (document_id);

CREATE INDEX IF NOT EXISTS idx_ai_chunks_embedding_ivfflat
  ON ai_document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_student
  ON ai_chat_sessions (student_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session
  ON ai_chat_messages (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_student_time
  ON ai_usage_logs (student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_scope_time
  ON ai_usage_logs (organization_id, campus_id, class_id, section_id, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_quota_counters_student
  ON ai_quota_counters (student_id, period_type, period_start);

CREATE INDEX IF NOT EXISTS idx_ai_document_jobs_status
  ON ai_document_jobs (status, created_at);

-- ── Vector search RPC (scoped) ──────────────────────────────
CREATE OR REPLACE FUNCTION match_ai_chunks(
  p_query_embedding vector(1536),
  p_org_id          INTEGER,
  p_campus_id       INTEGER,
  p_class_id        INTEGER,
  p_section_id      INTEGER,
  p_subject_id      INTEGER,
  p_match_count     INTEGER DEFAULT 8
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
  SELECT
    c.id,
    c.document_id,
    c.content,
    1 - (c.embedding <=> p_query_embedding) AS similarity,
    c.metadata
  FROM ai_document_chunks c
  JOIN ai_documents d ON d.id = c.document_id
  WHERE d.status = 'ready'
    AND c.organization_id = p_org_id
    AND c.campus_id       = p_campus_id
    AND c.subject_id      = p_subject_id
    AND (c.class_id   IS NULL OR p_class_id   IS NULL OR c.class_id   = p_class_id)
    AND (c.section_id IS NULL OR p_section_id IS NULL OR c.section_id = p_section_id)
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT GREATEST(p_match_count, 1);
$$;

-- ── RLS (deny-all; edge functions use service role) ─────────
ALTER TABLE ai_feature_flags        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_quota_policies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_document_jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_document_chunks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_quota_counters       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_rate_limit_buckets   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_ai_feature_flags') THEN
    CREATE POLICY deny_all_ai_feature_flags        ON ai_feature_flags        FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_ai_quota_policies') THEN
    CREATE POLICY deny_all_ai_quota_policies       ON ai_quota_policies       FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_ai_documents') THEN
    CREATE POLICY deny_all_ai_documents            ON ai_documents            FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_ai_document_jobs') THEN
    CREATE POLICY deny_all_ai_document_jobs        ON ai_document_jobs        FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_ai_document_chunks') THEN
    CREATE POLICY deny_all_ai_document_chunks      ON ai_document_chunks      FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_ai_chat_sessions') THEN
    CREATE POLICY deny_all_ai_chat_sessions        ON ai_chat_sessions        FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_ai_chat_messages') THEN
    CREATE POLICY deny_all_ai_chat_messages        ON ai_chat_messages        FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_ai_quota_counters') THEN
    CREATE POLICY deny_all_ai_quota_counters       ON ai_quota_counters       FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_ai_usage_logs') THEN
    CREATE POLICY deny_all_ai_usage_logs           ON ai_usage_logs           FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deny_all_ai_rate_limit_buckets') THEN
    CREATE POLICY deny_all_ai_rate_limit_buckets   ON ai_rate_limit_buckets   FOR ALL USING (false) WITH CHECK (false);
  END IF;
END $$;

-- ── Storage bucket for AI materials ─────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-materials', 'ai-materials', FALSE)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ai_materials_service_only_read') THEN
    CREATE POLICY ai_materials_service_only_read
      ON storage.objects FOR SELECT USING (bucket_id = 'ai-materials' AND auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ai_materials_service_only_write') THEN
    CREATE POLICY ai_materials_service_only_write
      ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'ai-materials' AND auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ai_materials_service_only_delete') THEN
    CREATE POLICY ai_materials_service_only_delete
      ON storage.objects FOR DELETE USING (bucket_id = 'ai-materials' AND auth.role() = 'service_role');
  END IF;
END $$;

-- ── Defaults: global flag on, conservative quotas ───────────
INSERT INTO ai_feature_flags (scope_type, scope_id, is_enabled, reason, updated_by_role, updated_by_id)
VALUES ('global', NULL, TRUE, 'Initial bootstrap', 'super_admin', 0)
ON CONFLICT (scope_type, scope_id) DO NOTHING;

INSERT INTO ai_quota_policies (
  scope_type, scope_id,
  daily_requests, weekly_requests, monthly_requests,
  daily_tokens, weekly_tokens, monthly_tokens,
  max_input_tokens, max_output_tokens,
  updated_by_role, updated_by_id
) VALUES (
  'global', NULL,
  40, 200, 600,
  60000, 300000, 900000,
  2000, 700,
  'super_admin', 0
)
ON CONFLICT (scope_type, scope_id) DO NOTHING;

COMMIT;

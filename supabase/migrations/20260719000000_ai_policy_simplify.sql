-- ============================================================
--  AI Tutor — Policy Simplification
--  Replaces the percent/pool-distribution allocation model (which was both
--  the source of "inherit doesn't work" bugs and the main UI complexity)
--  with plain "closest explicit scope wins" resolution, and adds a teacher
--  quota dimension (a single shared limit per organization/campus, since
--  teacher usage — mainly material uploads — was previously ungoverned).
-- ============================================================

BEGIN;

-- ── 1) Simplify ai_quota_policies ───────────────────────────
-- Drop weekly fields (daily + monthly cover the real need) and the
-- percent/mode columns that powered pool distribution.
ALTER TABLE ai_quota_policies
  DROP COLUMN IF EXISTS weekly_requests,
  DROP COLUMN IF EXISTS weekly_tokens,
  DROP COLUMN IF EXISTS daily_requests_mode,
  DROP COLUMN IF EXISTS weekly_requests_mode,
  DROP COLUMN IF EXISTS monthly_requests_mode,
  DROP COLUMN IF EXISTS daily_tokens_mode,
  DROP COLUMN IF EXISTS weekly_tokens_mode,
  DROP COLUMN IF EXISTS monthly_tokens_mode,
  DROP COLUMN IF EXISTS daily_requests_percent_bps,
  DROP COLUMN IF EXISTS weekly_requests_percent_bps,
  DROP COLUMN IF EXISTS monthly_requests_percent_bps,
  DROP COLUMN IF EXISTS daily_tokens_percent_bps,
  DROP COLUMN IF EXISTS weekly_tokens_percent_bps,
  DROP COLUMN IF EXISTS monthly_tokens_percent_bps;

-- actor_type distinguishes a student-facing policy row from a teacher one.
-- Teachers only get a shared limit at global/organization/campus scope —
-- there's no per-class/section/student teacher policy, matching how
-- teacher usage (mostly material uploads) is actually governed.
ALTER TABLE ai_quota_policies
  ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'student' CHECK (actor_type IN ('student','teacher'));

ALTER TABLE ai_quota_policies
  DROP CONSTRAINT IF EXISTS ai_quota_policies_scope_unique;
ALTER TABLE ai_quota_policies
  ADD CONSTRAINT ai_quota_policies_scope_unique UNIQUE (actor_type, scope_type, scope_id);

ALTER TABLE ai_quota_policies
  DROP CONSTRAINT IF EXISTS ai_quota_policies_teacher_scope_chk;
ALTER TABLE ai_quota_policies
  ADD CONSTRAINT ai_quota_policies_teacher_scope_chk CHECK (
    actor_type = 'student' OR scope_type IN ('global','organization','campus')
  );

-- ── 2) Simplify ai_quota_counters (students) ────────────────
DELETE FROM ai_quota_counters WHERE period_type = 'weekly';
ALTER TABLE ai_quota_counters
  DROP CONSTRAINT IF EXISTS ai_quota_counters_period_type_check;
ALTER TABLE ai_quota_counters
  ADD CONSTRAINT ai_quota_counters_period_type_check CHECK (period_type IN ('daily','monthly'));

-- ── 3) Teacher quota counters — pooled per (organization|campus), not ───
-- per-teacher, matching "one shared limit for all teachers at that scope".
CREATE TABLE IF NOT EXISTS ai_teacher_quota_counters (
  id            BIGSERIAL PRIMARY KEY,
  scope_type    TEXT NOT NULL CHECK (scope_type IN ('global','organization','campus')),
  scope_id      INTEGER,
  period_type   TEXT NOT NULL CHECK (period_type IN ('daily','monthly')),
  period_start  DATE NOT NULL,
  used_requests INTEGER NOT NULL DEFAULT 0,
  used_tokens   INTEGER NOT NULL DEFAULT 0,
  policy_epoch  BIGINT NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_teacher_quota_counters_scope_id_chk CHECK (
    (scope_type = 'global' AND scope_id IS NULL) OR
    (scope_type <> 'global' AND scope_id IS NOT NULL)
  ),
  CONSTRAINT ai_teacher_quota_counters_unique UNIQUE (scope_type, scope_id, period_type, period_start, policy_epoch)
);

-- ── 4) Usage logs: let a teacher-attributed event be recorded (uploads). ─
ALTER TABLE ai_usage_logs
  ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'student' CHECK (actor_type IN ('student','teacher')),
  ADD COLUMN IF NOT EXISTS teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL;

COMMIT;

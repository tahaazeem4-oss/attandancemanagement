BEGIN;

ALTER TABLE ai_quota_policies
  ADD COLUMN IF NOT EXISTS daily_requests_mode TEXT CHECK (daily_requests_mode IN ('inherit','fixed','percent')),
  ADD COLUMN IF NOT EXISTS weekly_requests_mode TEXT CHECK (weekly_requests_mode IN ('inherit','fixed','percent')),
  ADD COLUMN IF NOT EXISTS monthly_requests_mode TEXT CHECK (monthly_requests_mode IN ('inherit','fixed','percent')),
  ADD COLUMN IF NOT EXISTS daily_tokens_mode TEXT CHECK (daily_tokens_mode IN ('inherit','fixed','percent')),
  ADD COLUMN IF NOT EXISTS weekly_tokens_mode TEXT CHECK (weekly_tokens_mode IN ('inherit','fixed','percent')),
  ADD COLUMN IF NOT EXISTS monthly_tokens_mode TEXT CHECK (monthly_tokens_mode IN ('inherit','fixed','percent')),
  ADD COLUMN IF NOT EXISTS daily_requests_percent_bps INTEGER,
  ADD COLUMN IF NOT EXISTS weekly_requests_percent_bps INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_requests_percent_bps INTEGER,
  ADD COLUMN IF NOT EXISTS daily_tokens_percent_bps INTEGER,
  ADD COLUMN IF NOT EXISTS weekly_tokens_percent_bps INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_tokens_percent_bps INTEGER;

UPDATE ai_quota_policies
SET
  daily_requests_mode = COALESCE(daily_requests_mode, CASE WHEN daily_requests IS NULL THEN 'inherit' ELSE 'fixed' END),
  weekly_requests_mode = COALESCE(weekly_requests_mode, CASE WHEN weekly_requests IS NULL THEN 'inherit' ELSE 'fixed' END),
  monthly_requests_mode = COALESCE(monthly_requests_mode, CASE WHEN monthly_requests IS NULL THEN 'inherit' ELSE 'fixed' END),
  daily_tokens_mode = COALESCE(daily_tokens_mode, CASE WHEN daily_tokens IS NULL THEN 'inherit' ELSE 'fixed' END),
  weekly_tokens_mode = COALESCE(weekly_tokens_mode, CASE WHEN weekly_tokens IS NULL THEN 'inherit' ELSE 'fixed' END),
  monthly_tokens_mode = COALESCE(monthly_tokens_mode, CASE WHEN monthly_tokens IS NULL THEN 'inherit' ELSE 'fixed' END)
WHERE
  daily_requests_mode IS NULL OR weekly_requests_mode IS NULL OR monthly_requests_mode IS NULL OR
  daily_tokens_mode IS NULL OR weekly_tokens_mode IS NULL OR monthly_tokens_mode IS NULL;

ALTER TABLE ai_quota_policies
  ALTER COLUMN daily_requests_mode SET DEFAULT 'inherit',
  ALTER COLUMN weekly_requests_mode SET DEFAULT 'inherit',
  ALTER COLUMN monthly_requests_mode SET DEFAULT 'inherit',
  ALTER COLUMN daily_tokens_mode SET DEFAULT 'inherit',
  ALTER COLUMN weekly_tokens_mode SET DEFAULT 'inherit',
  ALTER COLUMN monthly_tokens_mode SET DEFAULT 'inherit';

CREATE TABLE IF NOT EXISTS ai_quota_runtime_state (
  singleton_id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton_id = TRUE),
  policy_epoch BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ai_quota_runtime_state (singleton_id, policy_epoch)
VALUES (TRUE, 1)
ON CONFLICT (singleton_id) DO NOTHING;

ALTER TABLE ai_quota_counters
  ADD COLUMN IF NOT EXISTS policy_epoch BIGINT NOT NULL DEFAULT 1;

ALTER TABLE ai_quota_counters
  DROP CONSTRAINT IF EXISTS ai_quota_counters_student_id_period_type_period_start_key;

ALTER TABLE ai_quota_counters
  ADD CONSTRAINT ai_quota_counters_epoch_unique UNIQUE (student_id, period_type, period_start, policy_epoch);

DROP INDEX IF EXISTS idx_ai_quota_counters_student;
CREATE INDEX IF NOT EXISTS idx_ai_quota_counters_student_epoch
  ON ai_quota_counters (student_id, policy_epoch, period_type, period_start);

COMMIT;
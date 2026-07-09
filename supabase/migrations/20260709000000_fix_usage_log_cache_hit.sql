-- Add 'cache_hit' to the ai_usage_logs event_type CHECK constraint.
-- The original constraint was missing this value which caused a DB error
-- whenever a cached answer was returned.

ALTER TABLE ai_usage_logs
  DROP CONSTRAINT IF EXISTS ai_usage_logs_event_type_check;

ALTER TABLE ai_usage_logs
  ADD CONSTRAINT ai_usage_logs_event_type_check
  CHECK (event_type IN (
    'query',
    'cache_hit',
    'blocked_quota',
    'blocked_scope',
    'blocked_rate_limit',
    'no_context',
    'ingest',
    'ingest_failed'
  ));

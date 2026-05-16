-- Quick check: Is global AI flag ON?
SELECT 'Global AI Flag Status' as check,
  is_enabled,
  reason,
  updated_at
FROM ai_feature_flags
WHERE scope_type = 'global' AND scope_id IS NULL;

-- If is_enabled = false above, run this to fix it:
-- UPDATE ai_feature_flags SET is_enabled = TRUE WHERE scope_type = 'global' AND scope_id IS NULL;

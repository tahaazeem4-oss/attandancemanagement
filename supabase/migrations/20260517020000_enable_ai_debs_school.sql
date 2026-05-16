-- ============================================================
-- Enable AI Tutor for All Organizations & Campuses
-- Fixed query bug: now properly evaluates flags at any level
-- ============================================================

BEGIN;

-- Enable AI for all organizations (if not already set)
INSERT INTO ai_feature_flags (scope_type, scope_id, is_enabled, reason, updated_by_role, updated_by_id, updated_at)
SELECT 'organization', id, TRUE, 'AI Enabled for Organization', 'super_admin', 0, NOW()
FROM organizations
ON CONFLICT (scope_type, scope_id) DO UPDATE
SET is_enabled = TRUE, 
    reason = 'AI Enabled for Organization',
    updated_at = NOW();

-- Enable AI for all campuses (schools)
INSERT INTO ai_feature_flags (scope_type, scope_id, is_enabled, reason, updated_by_role, updated_by_id, updated_at)
SELECT 'campus', id, TRUE, 'AI Enabled for Campus', 'super_admin', 0, NOW()
FROM schools
ON CONFLICT (scope_type, scope_id) DO UPDATE
SET is_enabled = TRUE,
    reason = 'AI Enabled for Campus',
    updated_at = NOW();

-- Ensure quota policies exist for all organizations
INSERT INTO ai_quota_policies (scope_type, scope_id, daily_requests, weekly_requests, monthly_requests, daily_tokens, weekly_tokens, monthly_tokens, max_input_tokens, max_output_tokens, updated_by_role, updated_by_id, updated_at)
SELECT 'organization', id, 40, 200, 600, 60000, 300000, 900000, 2000, 700, 'super_admin', 0, NOW()
FROM organizations
ON CONFLICT (scope_type, scope_id) DO NOTHING;

-- Ensure quota policies exist for all campuses
INSERT INTO ai_quota_policies (scope_type, scope_id, daily_requests, weekly_requests, monthly_requests, daily_tokens, weekly_tokens, monthly_tokens, max_input_tokens, max_output_tokens, updated_by_role, updated_by_id, updated_at)
SELECT 'campus', id, 40, 200, 600, 60000, 300000, 900000, 2000, 700, 'super_admin', 0, NOW()
FROM schools
ON CONFLICT (scope_type, scope_id) DO NOTHING;

COMMIT;

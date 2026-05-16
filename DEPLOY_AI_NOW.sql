-- ============================================================
-- DEPLOY: Enable AI Tutor for ALL Organizations & Campuses
-- ============================================================
-- This enables AI features hierarchically for the entire system
-- Org admins, campus admins, teachers, and students can now use AI

BEGIN;

-- Step 1: Enable AI for all organizations
INSERT INTO ai_feature_flags (scope_type, scope_id, is_enabled, reason, updated_by_role, updated_by_id, updated_at)
SELECT 'organization', id, TRUE, 'AI Enabled for Organization', 'super_admin', 0, NOW()
FROM organizations
ON CONFLICT (scope_type, scope_id) DO UPDATE
SET is_enabled = TRUE, reason = 'AI Enabled for Organization', updated_at = NOW();

-- Step 2: Enable AI for all campuses (schools)
INSERT INTO ai_feature_flags (scope_type, scope_id, is_enabled, reason, updated_by_role, updated_by_id, updated_at)
SELECT 'campus', id, TRUE, 'AI Enabled for Campus', 'super_admin', 0, NOW()
FROM schools
ON CONFLICT (scope_type, scope_id) DO UPDATE
SET is_enabled = TRUE, reason = 'AI Enabled for Campus', updated_at = NOW();

-- Step 3: Set quota policies for all organizations
INSERT INTO ai_quota_policies (scope_type, scope_id, daily_requests, weekly_requests, monthly_requests, daily_tokens, weekly_tokens, monthly_tokens, max_input_tokens, max_output_tokens, updated_by_role, updated_by_id, updated_at)
SELECT 'organization', id, 40, 200, 600, 60000, 300000, 900000, 2000, 700, 'super_admin', 0, NOW()
FROM organizations
ON CONFLICT (scope_type, scope_id) DO NOTHING;

-- Step 4: Set quota policies for all campuses
INSERT INTO ai_quota_policies (scope_type, scope_id, daily_requests, weekly_requests, monthly_requests, daily_tokens, weekly_tokens, monthly_tokens, max_input_tokens, max_output_tokens, updated_by_role, updated_by_id, updated_at)
SELECT 'campus', id, 40, 200, 600, 60000, 300000, 900000, 2000, 700, 'super_admin', 0, NOW()
FROM schools
ON CONFLICT (scope_type, scope_id) DO NOTHING;

COMMIT;

-- Verification: Check what was enabled
SELECT 'Verification Results:' as status;
SELECT COUNT(*) as organization_flags_enabled FROM ai_feature_flags WHERE scope_type = 'organization' AND is_enabled = TRUE;
SELECT COUNT(*) as campus_flags_enabled FROM ai_feature_flags WHERE scope_type = 'campus' AND is_enabled = TRUE;
SELECT COUNT(*) as org_quotas_set FROM ai_quota_policies WHERE scope_type = 'organization';
SELECT COUNT(*) as campus_quotas_set FROM ai_quota_policies WHERE scope_type = 'campus';

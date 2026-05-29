-- Enable AI Tutor for Debs School Organization and Campuses
-- This migration ensures AI flags are created for Debs school

BEGIN;

-- Find Debs organization and enable AI
INSERT INTO ai_feature_flags (scope_type, scope_id, is_enabled, reason, updated_by_role, updated_by_id, updated_at)
SELECT 'organization', o.id, TRUE, 'Enable AI Tutor for Debs school', 'super_admin', 0, NOW()
FROM organizations o
WHERE o.name ILIKE '%Debs%'
ON CONFLICT (scope_type, scope_id) DO UPDATE
SET is_enabled = TRUE, reason = 'Enable AI Tutor for Debs school', updated_at = NOW();

-- Enable AI for all Debs campuses
INSERT INTO ai_feature_flags (scope_type, scope_id, is_enabled, reason, updated_by_role, updated_by_id, updated_at)
SELECT 'campus', s.id, TRUE, 'Enable AI Tutor for Debs campus', 'super_admin', 0, NOW()
FROM schools s
WHERE s.org_id IN (
  SELECT id FROM organizations WHERE name ILIKE '%Debs%'
)
ON CONFLICT (scope_type, scope_id) DO UPDATE
SET is_enabled = TRUE, reason = 'Enable AI Tutor for Debs campus', updated_at = NOW();

-- Also ensure quota policies are set (inherit from global if not set)
INSERT INTO ai_quota_policies (
  scope_type, scope_id,
  daily_requests, weekly_requests, monthly_requests,
  daily_tokens, weekly_tokens, monthly_tokens,
  max_input_tokens, max_output_tokens,
  updated_by_role, updated_by_id, updated_at
)
SELECT 'organization', o.id, 40, 200, 600, 60000, 300000, 900000, 2000, 700, 'super_admin', 0, NOW()
FROM organizations o
WHERE o.name ILIKE '%Debs%'
ON CONFLICT (scope_type, scope_id) DO NOTHING;

INSERT INTO ai_quota_policies (
  scope_type, scope_id,
  daily_requests, weekly_requests, monthly_requests,
  daily_tokens, weekly_tokens, monthly_tokens,
  max_input_tokens, max_output_tokens,
  updated_by_role, updated_by_id, updated_at
)
SELECT 'campus', s.id, 40, 200, 600, 60000, 300000, 900000, 2000, 700, 'super_admin', 0, NOW()
FROM schools s
WHERE s.org_id IN (
  SELECT id FROM organizations WHERE name ILIKE '%Debs%'
)
ON CONFLICT (scope_type, scope_id) DO NOTHING;

-- Verify flags are set
SELECT 'AI Flags Set:' as status,
  (SELECT COUNT(*) FROM ai_feature_flags WHERE scope_type = 'organization' AND is_enabled = TRUE) as org_flags,
  (SELECT COUNT(*) FROM ai_feature_flags WHERE scope_type = 'campus' AND is_enabled = TRUE) as campus_flags;

COMMIT;

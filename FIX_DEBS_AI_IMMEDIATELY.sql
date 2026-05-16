-- ============================================================
-- DEBS SCHOOL AI FLAG FIX - DIAGNOSTIC & SOLUTION
-- ============================================================

-- Step 1: Verify Debs organization exists
SELECT 'STEP 1: Debs Organization' as step;
SELECT id, name, created_at FROM organizations WHERE name ILIKE '%Debs%';

-- Step 2: Find Debs campuses
SELECT 'STEP 2: Debs Campuses' as step;
SELECT id, name, org_id, school_code FROM schools 
WHERE org_id IN (SELECT id FROM organizations WHERE name ILIKE '%Debs%')
ORDER BY name;

-- Step 3: Check current AI flags for Debs (before fix)
SELECT 'STEP 3: Current AI Flags (Before Fix)' as step;
SELECT scope_type, scope_id, is_enabled, reason, updated_at FROM ai_feature_flags
WHERE scope_type IN ('organization', 'campus')
  AND scope_id IN (
    SELECT id FROM organizations WHERE name ILIKE '%Debs%'
    UNION ALL
    SELECT id FROM schools WHERE org_id IN (SELECT id FROM organizations WHERE name ILIKE '%Debs%')
  )
ORDER BY scope_type, scope_id;

-- Step 4: Check quota policies
SELECT 'STEP 4: Quota Policies (Before Fix)' as step;
SELECT scope_type, scope_id, daily_requests, daily_tokens, updated_at FROM ai_quota_policies
WHERE scope_type IN ('organization', 'campus')
  AND scope_id IN (
    SELECT id FROM organizations WHERE name ILIKE '%Debs%'
    UNION ALL
    SELECT id FROM schools WHERE org_id IN (SELECT id FROM organizations WHERE name ILIKE '%Debs%')
  );

-- ============================================================
-- FIX: Insert/Update AI flags to TRUE for Debs
-- ============================================================

BEGIN;

-- Enable AI for Debs Organization
INSERT INTO ai_feature_flags (scope_type, scope_id, is_enabled, reason, updated_by_role, updated_by_id, updated_at)
SELECT 'organization' AS scope_type, id, TRUE, 'FIXED: Enable AI Tutor for Debs school', 'super_admin', 0, NOW()
FROM organizations WHERE name ILIKE '%Debs%'
ON CONFLICT (scope_type, scope_id) DO UPDATE
SET is_enabled = TRUE, 
    reason = 'FIXED: Enable AI Tutor for Debs school',
    updated_at = NOW();

-- Enable AI for all Debs Campuses  
INSERT INTO ai_feature_flags (scope_type, scope_id, is_enabled, reason, updated_by_role, updated_by_id, updated_at)
SELECT 'campus' AS scope_type, id, TRUE, 'FIXED: Enable AI Tutor for Debs campus', 'super_admin', 0, NOW()
FROM schools 
WHERE org_id IN (SELECT id FROM organizations WHERE name ILIKE '%Debs%')
ON CONFLICT (scope_type, scope_id) DO UPDATE
SET is_enabled = TRUE,
    reason = 'FIXED: Enable AI Tutor for Debs campus',
    updated_at = NOW();

-- Ensure quota policies exist for Debs org
INSERT INTO ai_quota_policies (scope_type, scope_id, daily_requests, weekly_requests, monthly_requests, daily_tokens, weekly_tokens, monthly_tokens, max_input_tokens, max_output_tokens, updated_by_role, updated_by_id, updated_at)
SELECT 'organization', id, 40, 200, 600, 60000, 300000, 900000, 2000, 700, 'super_admin', 0, NOW()
FROM organizations WHERE name ILIKE '%Debs%'
ON CONFLICT (scope_type, scope_id) DO NOTHING;

-- Ensure quota policies exist for Debs campuses
INSERT INTO ai_quota_policies (scope_type, scope_id, daily_requests, weekly_requests, monthly_requests, daily_tokens, weekly_tokens, monthly_tokens, max_input_tokens, max_output_tokens, updated_by_role, updated_by_id, updated_at)
SELECT 'campus', id, 40, 200, 600, 60000, 300000, 900000, 2000, 700, 'super_admin', 0, NOW()
FROM schools WHERE org_id IN (SELECT id FROM organizations WHERE name ILIKE '%Debs%')
ON CONFLICT (scope_type, scope_id) DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICATION: Check AI flags after fix
-- ============================================================

SELECT 'STEP 5: AI Flags (After Fix)' as step;
SELECT scope_type, scope_id, is_enabled, reason, updated_at FROM ai_feature_flags
WHERE scope_type IN ('organization', 'campus')
  AND scope_id IN (
    SELECT id FROM organizations WHERE name ILIKE '%Debs%'
    UNION ALL
    SELECT id FROM schools WHERE org_id IN (SELECT id FROM organizations WHERE name ILIKE '%Debs%')
  )
ORDER BY scope_type, scope_id;

SELECT 'STEP 6: Summary - Debs AI Status' as step,
  COALESCE((SELECT COUNT(*) FROM ai_feature_flags 
    WHERE scope_type = 'organization' 
    AND scope_id IN (SELECT id FROM organizations WHERE name ILIKE '%Debs%')
    AND is_enabled = TRUE), 0) as org_flags_enabled,
  COALESCE((SELECT COUNT(*) FROM ai_feature_flags 
    WHERE scope_type = 'campus' 
    AND scope_id IN (SELECT id FROM schools WHERE org_id IN (SELECT id FROM organizations WHERE name ILIKE '%Debs%'))
    AND is_enabled = TRUE), 0) as campus_flags_enabled;

-- ============================================================
-- RESULT: If both counts > 0, AI is now ENABLED for Debs
-- ============================================================

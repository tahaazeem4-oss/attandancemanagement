# DEBS AI FIX - IMMEDIATE ACTION REQUIRED

## Problem
Debs org + campus have AI disabled. Users cannot see AI features.

## Root Cause
AI feature flags not set at organization or campus level in database.

## Solution (3 Steps)

### STEP 1: Run diagnostic SQL
Open Supabase SQL Editor and run:
```sql
SELECT scope_type, scope_id, is_enabled 
FROM ai_feature_flags 
WHERE scope_type IN ('global', 'organization', 'campus');
```

**Expected result:**
- One row: `global | null | true` ✅
- Multiple rows: `organization | X | true` (one per org)
- Multiple rows: `campus | Y | true` (one per campus)

**If NOT found:** Continue to Step 2

---

### STEP 2: RUN THIS SQL TO FIX IT (Copy-paste into Supabase SQL Editor)

```sql
-- ENABLE AI FOR DEBS IMMEDIATELY
BEGIN;

-- 1. Enable AI for Debs Organization
INSERT INTO ai_feature_flags (scope_type, scope_id, is_enabled, reason, updated_by_role, updated_by_id, updated_at)
SELECT 'organization', id, TRUE, 'AI Enabled for Debs', 'super_admin', 0, NOW()
FROM organizations WHERE name ILIKE '%Debs%'
ON CONFLICT (scope_type, scope_id) DO UPDATE
SET is_enabled = TRUE, reason = 'AI Enabled for Debs', updated_at = NOW();

-- 2. Enable AI for all Debs Campuses
INSERT INTO ai_feature_flags (scope_type, scope_id, is_enabled, reason, updated_by_role, updated_by_id, updated_at)
SELECT 'campus', id, TRUE, 'AI Enabled for Debs Campus', 'super_admin', 0, NOW()
FROM schools WHERE org_id IN (SELECT id FROM organizations WHERE name ILIKE '%Debs%')
ON CONFLICT (scope_type, scope_id) DO UPDATE
SET is_enabled = TRUE, reason = 'AI Enabled for Debs Campus', updated_at = NOW();

-- 3. Add quotas for Debs org
INSERT INTO ai_quota_policies (scope_type, scope_id, daily_requests, weekly_requests, monthly_requests, daily_tokens, weekly_tokens, monthly_tokens, max_input_tokens, max_output_tokens, updated_by_role, updated_by_id, updated_at)
SELECT 'organization', id, 40, 200, 600, 60000, 300000, 900000, 2000, 700, 'super_admin', 0, NOW()
FROM organizations WHERE name ILIKE '%Debs%'
ON CONFLICT (scope_type, scope_id) DO NOTHING;

-- 4. Add quotas for Debs campuses
INSERT INTO ai_quota_policies (scope_type, scope_id, daily_requests, weekly_requests, monthly_requests, daily_tokens, weekly_tokens, monthly_tokens, max_input_tokens, max_output_tokens, updated_by_role, updated_by_id, updated_at)
SELECT 'campus', id, 40, 200, 600, 60000, 300000, 900000, 2000, 700, 'super_admin', 0, NOW()
FROM schools WHERE org_id IN (SELECT id FROM organizations WHERE name ILIKE '%Debs%')
ON CONFLICT (scope_type, scope_id) DO NOTHING;

COMMIT;

-- Verify it worked
SELECT 'AI Status for Debs:' as status,
  (SELECT COUNT(*) FROM ai_feature_flags WHERE scope_type = 'organization' AND is_enabled = TRUE AND scope_id IN (SELECT id FROM organizations WHERE name ILIKE '%Debs%')) as org_enabled,
  (SELECT COUNT(*) FROM ai_feature_flags WHERE scope_type = 'campus' AND is_enabled = TRUE AND scope_id IN (SELECT id FROM schools WHERE org_id IN (SELECT id FROM organizations WHERE name ILIKE '%Debs%'))) as campus_enabled;
```

**Expected result after execution:**
```
status                | org_enabled | campus_enabled
AI Status for Debs:   | 1 or more   | 1 or more
```

---

### STEP 3: Test it works

1. **Debs Org Admin** logs in → Navigate to dashboard
   - ✅ Should see "AI Policy" and "AI Analytics" cards
   
2. **Debs Campus Admin** logs in → Navigate to dashboard
   - ✅ Should see "AI Materials", "AI Policy", "AI Analytics" cards

3. **Debs Teacher** logs in → Navigate to dashboard
   - ✅ Should see "AI Materials" card

4. **Debs Student** logs in → Navigate to AI feature
   - ✅ Should see "AI Tutor" subject list and chat

---

## If STILL Not Working After SQL

Run this diagnostic:
```sql
-- Check if global flag is OFF (blocking everything)
SELECT is_enabled, reason FROM ai_feature_flags 
WHERE scope_type = 'global' AND scope_id IS NULL;
```

If `is_enabled = false`, run:
```sql
UPDATE ai_feature_flags 
SET is_enabled = TRUE, reason = 'Global AI Enabled'
WHERE scope_type = 'global' AND scope_id IS NULL;
```

Then test again.

---

## What Changed

**Backend:** Fixed query logic from `.or()` with nested `and()` to simple `.in()` operator (updated in aiScope.ts)

**Database:** Set `ai_feature_flags` rows for:
- scope_type='organization', scope_id=<Debs org ID>, is_enabled=true
- scope_type='campus', scope_id=<each Debs campus ID>, is_enabled=true

**Result:** Debs org admin → campus admin → teacher → student can now access AI features

---

## Do This NOW:

1. Copy the SQL from STEP 2 above
2. Go to Supabase Dashboard → SQL Editor
3. Paste and run
4. Verify output shows counts > 0
5. Test with Debs users
6. Report if still blocked

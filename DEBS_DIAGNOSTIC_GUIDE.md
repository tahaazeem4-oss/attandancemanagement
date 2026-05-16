# Debs School AI Flag Diagnostic Guide

## Problem Statement
- Debs organization + 1 campus have AI flags set to ON
- Users (org_admin, campus_admin, teacher, student) cannot see AI feature
- Despite flags being ON, AI is blocked

## Root Cause Analysis

### Possible Cause #1: Flags Don't Exist in Database ⚠️ MOST LIKELY

**Symptom:** Logs show `rows_count: 0` or only partial matches

```log
[aiScope] flag query returned { rows_count: 0, rows: '[]' }
```

**Why this happens:**
- Flags never inserted into `ai_feature_flags` table
- Or only inserted at global level, not org/campus level
- Or inserted for wrong org_id/campus_id

**Solution:** Insert flags using admin API
```bash
POST /ai-tutor/admin/feature-flag
{
  "scope_type": "organization",
  "scope_id": 2,  # Replace with actual Debs org_id
  "is_enabled": true,
  "reason": "Debs school activation"
}

POST /ai-tutor/admin/feature-flag
{
  "scope_type": "campus",
  "scope_id": 12,  # Replace with actual Debs campus_id
  "is_enabled": true,
  "reason": "Debs campus activation"
}
```

---

### Possible Cause #2: Scope Resolution Failed

**Symptom:** Logs show `scope_pairs: '[]'` (empty array)

```log
[aiScope] resolveOrgAdminScope for org_admin 5 { oa: null }
[aiScope] resolveOrgAdminScope FAILED: no org_admin or org_id
```

**Why this happens:**
- org_admins/admins/teachers record doesn't exist for that user
- User not linked to organization
- Database FK relationship broken

**Diagnostic logs to check:**
```log
[aiScope] resolveOrgAdminScope for org_admin 5 { oa: null }
  ↑ org_admin ID 5 not found in org_admins table

[aiScope] resolveAdminScope for admin 10 { admin: { id: 10, school_id: null } }
  ↑ admin found but school_id is null

[aiScope] resolveTeacherBaseScope for teacher 20 { teacher: null }
  ↑ teacher ID not found in teachers table
```

**Solution:** Verify user-organization relationships
```sql
-- Check if org_admin exists
SELECT id, org_id FROM org_admins WHERE id = 5;

-- Check if admin linked to campus
SELECT id, school_id FROM admins WHERE id = 10;

-- Check if teacher linked to campus
SELECT id, school_id FROM teachers WHERE id = 20;

-- Check if campus linked to org
SELECT id, org_id FROM schools WHERE id = 12;
```

---

### Possible Cause #3: Flag Exists But Value is FALSE

**Symptom:** Logs show flag found but `value: false`

```log
[aiScope] flag query returned { rows_count: 2, rows: '[...] "is_enabled":false}]' }
[aiScope] checking scope organization:2 { found: true, value: false }
[aiScope] access BLOCKED at scope organization
```

**Why this happens:**
- Flag explicitly set to OFF by admin
- Previous admin accidentally disabled it
- Bulk operation set wrong scopes to false

**Solution:** Verify flag values in database
```sql
SELECT scope_type, scope_id, is_enabled, reason, updated_at 
FROM ai_feature_flags 
WHERE scope_type IN ('global', 'organization', 'campus')
  AND (scope_id IS NULL OR scope_id IN (2, 12))
ORDER BY scope_type;
```

Expected result for Debs (org_id=2, campus_id=12):
```
scope_type   | scope_id | is_enabled | reason                   | updated_at
-------------|----------|------------|--------------------------|----
global       | null     | true       | Initial bootstrap         | ...
organization | 2        | true       | Debs school activation   | ...
campus       | 12       | true       | Debs campus activation   | ...
```

---

### Possible Cause #4: Wrong org_id or campus_id Being Used

**Symptom:** Logs show scope resolution but with WRONG IDs

```log
[aiScope] resolveOrgAdminScope resolved to { org_id: 999 }  # ← Should be 2 for Debs!
```

**Why this happens:**
- Data migration issue
- Two Debs orgs exist (org_id 2 and org_id 999)
- Org relationship wrong in schools table

**Solution:** Find correct Debs IDs
```sql
-- Find Debs organization
SELECT id, name FROM organizations WHERE name LIKE '%Debs%';

-- Find Debs campuses
SELECT id, name, org_id FROM schools 
WHERE org_id = 2  # Replace with actual org_id from above
ORDER BY name;

-- Verify org_admin points to correct org
SELECT id, name, org_id FROM org_admins 
WHERE org_id = 2;

-- Verify admin points to correct campus
SELECT a.id, a.name, a.school_id, s.org_id 
FROM admins a
JOIN schools s ON s.id = a.school_id
WHERE s.org_id = 2;
```

---

### Possible Cause #5: Query Returned Rows but Filtering Failed

**Symptom:** Query returns rows but still blocked

```log
[aiScope] flag query returned { rows_count: 3, rows: '[...]' }
[aiScope] checking scope global:null { found: true, value: true }
[aiScope] checking scope organization:2 { found: true, value: true }
[aiScope] checking scope campus:12 { found: false, value: undefined }
[aiScope] access ENABLED
```

**Why this happens:**
- Campus flag doesn't exist (only global + org)
- That's actually OK - global and org are ON so campus access enabled
- Missing campus-level flag is fine, inherits from parent

**This is NOT a problem.** If parent levels are true, child access is enabled.

---

## Diagnostic Query

Run this SQL to get complete picture of Debs:

```sql
-- 1. Find Debs organization
SELECT * FROM organizations 
WHERE name LIKE '%Debs%' OR name LIKE '%debs%';
-- Note the org_id (let's say it's 2)

-- 2. Find Debs campuses
SELECT * FROM schools 
WHERE org_id = 2 
ORDER BY name;
-- Note the campus_id values (let's say 12, 13, 14)

-- 3. Check AI flags at all levels
SELECT 'Flags in Database:' as section, 
       scope_type, scope_id, is_enabled, reason, updated_at
FROM ai_feature_flags
WHERE scope_type IN ('global', 'organization', 'campus')
  AND (scope_id IS NULL OR scope_id = 2 OR scope_id IN (12, 13, 14))
ORDER BY scope_type, scope_id;

-- 4. Count org_admins for Debs
SELECT 'Org Admins:' as section, COUNT(*) as count
FROM org_admins
WHERE org_id = 2;

-- 5. Count campus admins for Debs
SELECT 'Campus Admins:' as section, COUNT(*) as count
FROM admins
WHERE school_id IN (SELECT id FROM schools WHERE org_id = 2);

-- 6. Count teachers for Debs
SELECT 'Teachers:' as section, COUNT(*) as count
FROM teachers
WHERE school_id IN (SELECT id FROM schools WHERE org_id = 2);

-- 7. Count students for Debs
SELECT 'Students:' as section, COUNT(*) as count
FROM students
WHERE school_id IN (SELECT id FROM schools WHERE org_id = 2);
```

---

## Step-by-Step Debugging

### Step 1: Check if Debs org_id and campus_id exist
```sql
SELECT id, name FROM organizations WHERE name LIKE '%Debs%';
SELECT id, name, org_id FROM schools WHERE name LIKE '%Debs%';
```

### Step 2: Check if flags exist for those IDs
```sql
SELECT * FROM ai_feature_flags 
WHERE (scope_id = <debs_org_id> AND scope_type = 'organization')
   OR (scope_id = <debs_campus_id> AND scope_type = 'campus');
```

### Step 3: If flags don't exist, insert them
```sql
INSERT INTO ai_feature_flags (scope_type, scope_id, is_enabled, reason, updated_by_role, updated_by_id)
VALUES 
  ('organization', <debs_org_id>, true, 'Debs school activation', 'super_admin', 0),
  ('campus', <debs_campus_id>, true, 'Debs campus activation', 'super_admin', 0)
ON CONFLICT (scope_type, scope_id) DO UPDATE
SET is_enabled = true, reason = 'Debs activation', updated_at = NOW();
```

### Step 4: Login as Debs org_admin and check logs
- Debs org admin user logs in
- Navigate to AI feature screen
- Check Supabase Edge Function logs
- Look for `[aiScope]` entries
- Verify logs match expected output from COMPLETE_TEST_PLAN.md

### Step 5: Check frontend logs
- Open browser DevTools (F12)
- Look for network request to `/ai-tutor/config/effective`
- Check response: should have `{ enabled: true, ... }`
- If `{ enabled: false, ... }`, check `blocked_at` field

---

## Log Analysis Patterns

### ✅ Healthy Pattern (AI Visible)
```
[aiScope] getEffectiveAiAccessForUser called { role: 'admin', userId: 10 }
[aiScope] resolveAdminScope resolved to { school_id: 12, org_id: 2 }
[aiScope] getEffectiveAiAccess called { ... scope_pairs: '[...organization...campus...]' }
[aiScope] flag query returned { rows_count: 3, rows: '[...] is_enabled:true ...' }
[aiScope] checking scope organization:2 { found: true, value: true }
[aiScope] checking scope campus:12 { found: true, value: true }
[aiScope] access ENABLED
→ Frontend gets: { enabled: true }
→ Result: ✅ AI cards visible
```

### ❌ Blocked Pattern (AI Not Visible - Intentional)
```
[aiScope] getEffectiveAiAccessForUser called { role: 'admin', userId: 10 }
[aiScope] resolveAdminScope resolved to { school_id: 12, org_id: 2 }
[aiScope] getEffectiveAiAccess called { ... }
[aiScope] flag query returned { rows_count: 3, rows: '[...] "scope_type":"campus"..."is_enabled":false ...' }
[aiScope] checking scope organization:2 { found: true, value: true }
[aiScope] checking scope campus:12 { found: true, value: false }
[aiScope] access BLOCKED at scope campus
→ Frontend gets: { enabled: false, blocked_at: 'campus' }
→ Result: ❌ AI cards hidden (because campus flag is OFF)
```

### ⚠️ Problem Pattern (Flags Missing)
```
[aiScope] getEffectiveAiAccessForUser called { role: 'admin', userId: 10 }
[aiScope] resolveAdminScope resolved to { school_id: 12, org_id: 2 }
[aiScope] getEffectiveAiAccess called { ... scope_pairs: '[...organization...campus...]' }
[aiScope] flag query returned { rows_count: 0, rows: '[]' }
[aiScope] checking scope organization:2 { found: false, value: undefined }
[aiScope] checking scope campus:12 { found: false, value: undefined }
[aiScope] access ENABLED  # ← Default to true when no explicit false
→ Frontend gets: { enabled: true }
→ But reason: flags don't exist (not intentional)
→ This is actually OK but may cause confusion
```

### ⚠️ Problem Pattern (Scope Resolution Failed)
```
[aiScope] getEffectiveAiAccessForUser called { role: 'admin', userId: 10 }
[aiScope] resolveAdminScope for admin 10 { admin: null }  # ← NOT FOUND
[aiScope] resolveAdminScope FAILED: no admin or school_id
[aiScope] admin scope resolution FAILED
→ Frontend gets: { enabled: false, blocked_at: 'campus' }
→ Reason: User not found in database or wrong ID
```

---

## Common Questions

**Q: What if flags exist but logs still show blocked?**
A: Check if flag value is false, or if a DIFFERENT scope level is false (e.g., class or section level).

**Q: What if only global flag exists?**
A: That's OK. Debs org/campus users will inherit global=true, so AI enabled.

**Q: What if campus flag is ON but class flag is OFF?**
A: Depends on context:
- For campus_admin/org_admin: inherited from campus level = enabled
- For teacher: if ANY assignment class is OFF = blocked
- For student in that class: will be blocked

**Q: Why does the log show 5 scope_pairs for a student but only 3 for admin?**
A: Admin only has org+campus. Student has org+campus+class+section+student. Depends on hierarchy depth.

**Q: Can I test without redeploying?**
A: Yes! The debug logs work without redeploying if you're already running the updated aiScope.ts. They'll appear in Supabase function logs.

---

## Root Cause Checklist

Use this checklist to identify the issue:

- [ ] **Flags missing:** Run SQL diagnostic query → insert flags
- [ ] **Wrong org_id:** Check organizations table → use correct ID
- [ ] **Wrong campus_id:** Check schools table → use correct ID
- [ ] **User not found:** Check admins/org_admins/teachers/students table
- [ ] **Flag is false:** Check is_enabled column in ai_feature_flags
- [ ] **Teacher assignment blocked:** Check if any teacher_classes has blocked class/section
- [ ] **Parent portal issue:** Check if student_id passed correctly in query params

Once you identify the issue and share logs, exact fix can be applied!

# AI Tutor Flag Debug Log Verification

## File Modified
- `supabase/functions/server/lib/aiScope.ts`

## Changes Summary

### 1. Query Logic Fix
**Before (Broken):**
```typescript
const orExpr = filters.map(f => 
  f.scope_id === null 
    ? `and(scope_type.eq.global,scope_id.is.null)`
    : `and(scope_type.eq.${f.scope_type},scope_id.eq.${f.scope_id})`
).join(",");

const { data, error } = await db
  .from("ai_feature_flags")
  .select("scope_type, scope_id, is_enabled")
  .or(orExpr);  // ← Unreliable nested OR
```

**After (Fixed):**
```typescript
const scopeTypes = scopePairs.map(p => p.type);
const { data, error } = await db
  .from("ai_feature_flags")
  .select("scope_type, scope_id, is_enabled")
  .in("scope_type", scopeTypes);  // ← Simple, reliable IN query

// Then locally filter by scope_id
const flagMap = new Map<string, boolean>();
for (const row of (data || [])) {
  const key = `${row.scope_type}:${row.scope_id ?? "null"}`;
  flagMap.set(key, row.is_enabled);
}
```

**Why this matters:** The `.or()` with nested `and()` calls is complex and may not work reliably with Supabase. The new approach queries by scope_type first (much simpler), then filters locally by (scope_type, scope_id) pairs.

---

## Debug Log Scenarios

### Scenario 1: Debs Org Admin with Flags ON

#### Setup
- Org Admin ID: 5
- Org ID: 2 (Debs)
- AI Flag: `ai_feature_flags` has row: `(scope_type='organization', scope_id=2, is_enabled=true)`
- Global Flag: `ai_feature_flags` has row: `(scope_type='global', scope_id=null, is_enabled=true)`

#### Expected Log Output
```
[aiScope] getEffectiveAiAccessForUser called { role: 'org_admin', userId: 5 }
[aiScope] resolveOrgAdminScope for org_admin 5 { oa: { id: 5, org_id: 2 } }
[aiScope] resolveOrgAdminScope resolved to { org_id: 2 }
[aiScope] getEffectiveAiAccess called { 
  role: 'org_admin', 
  user_id: 5, 
  scope_pairs: '[{"type":"global","id":null},{"type":"organization","id":2}]' 
}
[aiScope] flag query returned { 
  rows_count: 2, 
  rows: '[{"scope_type":"global","scope_id":null,"is_enabled":true},{"scope_type":"organization","scope_id":2,"is_enabled":true}]' 
}
[aiScope] checking scope global:null { found: true, value: true }
[aiScope] checking scope organization:2 { found: true, value: true }
[aiScope] access ENABLED (no explicit false found)
[aiScope] org_admin access resolved { enabled: true, blocked_at: undefined }
```

**Result:** ✅ `enabled: true` (AI VISIBLE)

---

### Scenario 2: Debs Campus Admin with Flags ON

#### Setup
- Admin ID: 10
- School ID: 12 (Debs Campus)
- Org ID: 2 (resolved from school)
- AI Flags:
  - `(scope_type='global', scope_id=null, is_enabled=true)`
  - `(scope_type='organization', scope_id=2, is_enabled=true)`
  - `(scope_type='campus', scope_id=12, is_enabled=true)`

#### Expected Log Output
```
[aiScope] getEffectiveAiAccessForUser called { role: 'admin', userId: 10 }
[aiScope] resolveAdminScope for admin 10 { admin: { id: 10, school_id: 12 } }
[aiScope] resolveAdminScope resolved to { school_id: 12, org_id: 2 }
[aiScope] getEffectiveAiAccess called { 
  role: 'admin', 
  user_id: 10, 
  scope_pairs: '[{"type":"global","id":null},{"type":"organization","id":2},{"type":"campus","id":12}]' 
}
[aiScope] flag query returned { 
  rows_count: 3, 
  rows: '[{"scope_type":"global","scope_id":null,"is_enabled":true},{"scope_type":"organization","scope_id":2,"is_enabled":true},{"scope_type":"campus","scope_id":12,"is_enabled":true}]' 
}
[aiScope] checking scope global:null { found: true, value: true }
[aiScope] checking scope organization:2 { found: true, value: true }
[aiScope] checking scope campus:12 { found: true, value: true }
[aiScope] access ENABLED (no explicit false found)
[aiScope] admin access resolved { enabled: true, blocked_at: undefined }
```

**Result:** ✅ `enabled: true` (AI VISIBLE)

---

### Scenario 3: Debs Teacher with Flags ON

#### Setup
- Teacher ID: 20
- School ID: 12 (Debs Campus)
- Org ID: 2
- AI Flags: Same as Scenario 2 (all ON)
- Teacher Assignments: 2 assignments
  - Class 5, Section 8
  - Class 6, Section 9
  - Both class/section flags also ON

#### Expected Log Output
```
[aiScope] getEffectiveAiAccessForUser called { role: 'teacher', userId: 20 }
[aiScope] resolveTeacherBaseScope for teacher 20 { teacher: { id: 20, school_id: 12 } }
[aiScope] resolveTeacherBaseScope resolved to { school_id: 12, org_id: 2 }
[aiScope] getEffectiveAiAccess called { 
  role: 'teacher', 
  user_id: 20, 
  scope_pairs: '[{"type":"global","id":null},{"type":"organization","id":2},{"type":"campus","id":12}]' 
}
[aiScope] flag query returned { 
  rows_count: 3, 
  rows: '[{"scope_type":"global","scope_id":null,"is_enabled":true},{"scope_type":"organization","scope_id":2,"is_enabled":true},{"scope_type":"campus","scope_id":12,"is_enabled":true}]' 
}
[aiScope] checking scope global:null { found: true, value: true }
[aiScope] checking scope organization:2 { found: true, value: true }
[aiScope] checking scope campus:12 { found: true, value: true }
[aiScope] access ENABLED (no explicit false found)
[aiScope] teacher baseAccess { enabled: true, blocked_at: undefined }
[aiScope] teacher assignments found { count: 2, assignments: [{"class_id":5,"section_id":8},{"class_id":6,"section_id":9}] }
[aiScope] teacher assignment access { class_id: 5, section_id: 8, enabled: true, blocked_at: undefined }
[aiScope] teacher assignment access { class_id: 6, section_id: 9, enabled: true, blocked_at: undefined }
[aiScope] teacher ENABLED (anyEnabled or no assignments)
```

**Result:** ✅ `enabled: true` (AI VISIBLE)

---

### Scenario 4: Debs Student with Flags ON

#### Setup
- Student ID: 100
- Class ID: 5
- Section ID: 8
- School ID: 12 (Debs Campus)
- Org ID: 2
- All flags ON (global, org, campus, class, section)

#### Expected Log Output
```
[aiScope] resolveStudentScope for student 100 { data: { id: 100, school_id: 12, class_id: 5, section_id: 8, ... } }
[aiScope] resolveStudentScope resolved to { 
  student_id: 100, 
  organization_id: 2, 
  campus_id: 12, 
  class_id: 5, 
  section_id: 8 
}
[aiScope] getEffectiveAiAccess called { 
  role: 'student', 
  user_id: 100, 
  scope_pairs: '[{"type":"global","id":null},{"type":"organization","id":2},{"type":"campus","id":12},{"type":"class","id":5},{"type":"section","id":8}]' 
}
[aiScope] flag query returned { 
  rows_count: 5, 
  rows: '[...all flags is_enabled:true...]' 
}
[aiScope] checking scope global:null { found: true, value: true }
[aiScope] checking scope organization:2 { found: true, value: true }
[aiScope] checking scope campus:12 { found: true, value: true }
[aiScope] checking scope class:5 { found: true, value: true }
[aiScope] checking scope section:8 { found: true, value: true }
[aiScope] access ENABLED (no explicit false found)
```

**Result:** ✅ `enabled: true` (AI VISIBLE)

---

### Scenario 5: Debs Org Admin with Flag OFF at Organization Level (Negative Test)

#### Setup
- Org Admin ID: 5
- Org ID: 2 (Debs)
- AI Flag: `(scope_type='organization', scope_id=2, is_enabled=FALSE)` ← KEY: FALSE!
- Global Flag: `(scope_type='global', scope_id=null, is_enabled=true)`

#### Expected Log Output
```
[aiScope] getEffectiveAiAccessForUser called { role: 'org_admin', userId: 5 }
[aiScope] resolveOrgAdminScope for org_admin 5 { oa: { id: 5, org_id: 2 } }
[aiScope] resolveOrgAdminScope resolved to { org_id: 2 }
[aiScope] getEffectiveAiAccess called { 
  role: 'org_admin', 
  user_id: 5, 
  scope_pairs: '[{"type":"global","id":null},{"type":"organization","id":2}]' 
}
[aiScope] flag query returned { 
  rows_count: 2, 
  rows: '[{"scope_type":"global","scope_id":null,"is_enabled":true},{"scope_type":"organization","scope_id":2,"is_enabled":false}]' 
}
[aiScope] checking scope global:null { found: true, value: true }
[aiScope] checking scope organization:2 { found: true, value: false }
[aiScope] access BLOCKED at scope organization
[aiScope] org_admin access resolved { enabled: false, blocked_at: 'organization' }
```

**Result:** ❌ `enabled: false, blocked_at: 'organization'` (AI BLOCKED)

---

## Key Verification Points

### ✅ Query Logic Verification

**Before:** Used complex `.or()` string building
- Risk: Supabase may not support nested `and()` in `.or()` calls
- Result: No rows returned, appears as if flags don't exist

**After:** Simple `.in()` query on scope_type
- Pros: 
  - Reliable, standard Supabase operator
  - Atomic operation
  - Easier to debug
- Then filter locally by (type, id) pairs
  - All scope IDs matched in-memory
  - No query syntax issues

### ✅ Debug Logging Verification

Every critical function logs:
1. **Function entry:** role, userId, scope_pairs
2. **Scope resolution:** which table rows retrieved
3. **Query results:** exact row count and data returned
4. **Evaluation step:** which scope checked, value found, decision made
5. **Final result:** enabled/blocked_at

This creates a complete audit trail from API call → decision → response.

### ✅ Scope Resolution Verification

- `resolveOrgAdminScope`: org_id extracted from org_admins table
- `resolveAdminScope`: school_id + org_id resolved from admins + schools tables
- `resolveTeacherBaseScope`: school_id + org_id resolved from teachers + schools tables
- `resolveStudentScope`: Full hierarchy resolved with class→school linkage priority

Each logs:
- Input ID
- Lookup result
- Final scope object

### ✅ Flag Checking Verification

Priority order (hard-coded):
```
["global", "organization", "campus", "class", "section", "student"]
```

Logic:
- Build map of `{type}:{id}` → boolean
- Check each scope in priority order
- **STOP at first FALSE** → access blocked
- No FALSE found → access enabled

---

## Expected Behavior for Debs School

**If all flags are ON:**
- Debs Org Admin → ✅ ENABLED
- Debs Campus Admin → ✅ ENABLED
- Debs Teacher → ✅ ENABLED
- Debs Student → ✅ ENABLED

**If ANY flag is OFF at any level in the chain:**
- User → ❌ BLOCKED at that level

**If flags don't exist in DB:**
- Query returns fewer rows
- Logs will show `rows_count: 0` or only partial matches
- User appears as DISABLED

---

## Troubleshooting Checklist

- [ ] Flags exist in `ai_feature_flags` table for Debs org/campus?
- [ ] Flags have correct `scope_type` and `scope_id` values?
- [ ] Flags have `is_enabled: true` for ON, `is_enabled: false` for OFF?
- [ ] Admin/teacher/student records linked correctly to org/campus?
- [ ] Supabase Edge Function logs show complete audit trail?
- [ ] Query returns the expected number of rows?
- [ ] No row has `is_enabled: false` in the chain?

---

## Files Modified

### `supabase/functions/server/lib/aiScope.ts`

**Sections changed:**
1. `getEffectiveAiAccess()` - Query logic + debug logging
2. `resolveStudentScope()` - Added debug logging
3. `resolveAdminScope()` - Added debug logging
4. `resolveOrgAdminScope()` - Added debug logging
5. `resolveTeacherBaseScope()` - Added debug logging
6. `getEffectiveAiAccessForUser()` - Added role routing logging + debug per role

**Lines modified:** ~150 lines (mostly adding console.log statements)

**Breaking changes:** None. All function signatures unchanged.

**Backward compatibility:** ✅ Yes. Existing code calling these functions will work unchanged.

---

## Next Steps

1. Deploy these changes to Supabase
2. Have Debs org_admin/admin/teacher/student login
3. They navigate to AI feature screens
4. Check Supabase Edge Function logs
5. Look for `[aiScope]` log lines
6. Share the logs or look for patterns:
   - ✅ "access ENABLED" = working
   - ❌ "access BLOCKED at X" = blocked at that level
   - ⚠️ "rows_count: 0" = flags missing from DB
   - ⚠️ "scope_pairs: []" = resolution failed

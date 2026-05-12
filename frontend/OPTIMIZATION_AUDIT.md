# App Optimization Audit and Automation Plan

## 1) Current state summary

- Frontend architecture has high role-based duplication across admin and org-admin screens.
- Backend API is already role-segmented and mostly parallel (`/admin/*` and `/org-admin/*`) with campus-scope differences.
- APK size inflation likely comes from release config and packaging strategy rather than JS code alone.

## 2) What was automated in this pass

### Reusable screen components

1. Shared subjects manager
- New reusable component: `src/components/SubjectsManagerScreen.js`
- Replaced role screens with thin wrappers:
  - `src/screens/admin/AdminSubjectsScreen.js`
  - `src/screens/orgadmin/OrgAdminSubjectsScreen.js`

2. Shared classes/sections manager
- New reusable component: `src/components/ClassesManagerScreen.js`
- Replaced role screens with thin wrappers:
  - `src/screens/admin/AdminClassesScreen.js`
  - `src/screens/orgadmin/OrgAdminClassesScreen.js`

3. Shared teachers manager
- New reusable component: `src/components/TeachersManagerScreen.js`
- Replaced role screens with thin wrappers:
  - `src/screens/admin/AdminTeachersScreen.js`
  - `src/screens/orgadmin/OrgAdminTeachersScreen.js`

4. Shared students manager
- New reusable component: `src/components/StudentsManagerScreen.js`
- Replaced role screens with thin wrappers:
  - `src/screens/admin/AdminStudentsScreen.js`
  - `src/screens/orgadmin/OrgAdminStudentsScreen.js`

5. Shared parents manager
- New reusable component: `src/components/ParentsManagerScreen.js`
- Replaced role screens with thin wrappers:
  - `src/screens/admin/AdminParentsScreen.js`
  - `src/screens/orgadmin/OrgAdminParentsScreen.js`

6. Shared leave requests manager
- New reusable component: `src/components/LeaveRequestsManagerScreen.js`
- Replaced role screens with thin wrappers:
  - `src/screens/admin/AdminLeavesScreen.js`
  - `src/screens/orgadmin/OrgAdminLeavesScreen.js`
  - `src/screens/TeacherLeavesScreen.js`

7. Shared role tab navigator composition
- Refactored `src/navigation/AppNavigator.js` to use one reusable tab builder (`RoleTabs`) for:
  - teacher
  - admin
  - org-admin
  - super-admin
  - student
- Consolidated repeated notification badge logic and API unread-count polling into one implementation.

8. Shared stack option constants
- Refactored `src/navigation/AppNavigator.js` to use a shared hidden-header constant for stack screens.
- Reduced boilerplate and lowered risk of role-stack drift when adding/changing screens.

### APK size optimizations (safe)

1. Reduced bundled assets scope
- Updated `app.json`:
  - `assetBundlePatterns` from `**/*` to `assets/**/*`

2. Enabled Android release shrink/minify
- Updated `android/gradle.properties`:
  - `android.enableMinifyInReleaseBuilds=true`
  - `android.enableShrinkResourcesInReleaseBuilds=true`

3. Reduced built architectures in local APKs
- Updated `android/gradle.properties`:
  - `reactNativeArchitectures=armeabi-v7a,arm64-v8a`

4. Better APK native-lib packaging compression
- Updated `android/gradle.properties`:
  - `expo.useLegacyPackaging=true`

5. Disabled dev network inspector flag
- Updated `android/gradle.properties`:
  - `EX_DEV_CLIENT_NETWORK_INSPECTOR=false`

## 3) Backend/API overlap analysis (high level)

Parallel role APIs already exist and are suitable for reusable frontend modules:

- Teachers:
  - `/admin/teachers/*`
  - `/org-admin/teachers/*`
- Students:
  - `/admin/students/*`
  - `/org-admin/students/*`
- Classes/Sections:
  - `/admin/classes`, `/admin/sections/*`
  - `/org-admin/classes`, `/org-admin/sections/*`
- Subjects:
  - `/subjects/*`
  - `/org-admin/subjects/*`
- Parents:
  - `/admin/parents/*`
  - `/org-admin/parents/*`

Main functional difference:
- Admin: single-campus scope (token school_id)
- Org-admin: multi-campus scope with optional campus filters

## 4) Recommended next automation phases

### Phase A (next high impact)

- Build shared reusable CRUD modules for remaining non-consolidated domains:
  - campuses
  - org-admin admins
  - super-admin organization/school management
- Keep API adapters per role (`adminAdapter`, `orgAdminAdapter`, `superAdminAdapter`) so UI logic is one code path.

### Phase B

- Introduce route config objects for each role stack/tab. ✅ Completed for core role stacks.
- Generate role navigators from config to avoid manual screen declarations. ✅ Completed for:
  - teacher home stack
  - admin home stack
  - org-admin home stack
  - super-admin home stack
  - student home stack
  - parent child home stack
  - parent portal tab registration
  - parent root stack registration
  - root role to tab/stack registration

- Centralized route config module. ✅ Completed:
  - extracted screen config arrays/builders into `src/navigation/routeConfig.js`
  - `AppNavigator.js` now focuses on rendering/orchestration instead of holding large role-specific config data

- Centralized tab composition module. ✅ Completed:
  - extracted role tab composition and tab UI helpers into `src/navigation/tabComposition.js`
  - `AppNavigator.js` now imports reusable `RoleTabs`, icon/badge helpers, and tab rendering helpers

### Phase C

- Introduce shared hooks:
  - `useEntityList`
  - `useCrudModal`
  - `useCampusFilter`
  - `useUnreadNotifications`
- Remove repeated modal/list/fetch patterns across remaining screens.

### Phase D (size and build)

- Build Android App Bundle (`.aab`) for production distribution.
- If APK is required for side-loading, produce per-ABI APKs instead of universal.
- Run dependency pruning after usage scan (safe removal only).

## 5) Expected impact

- Lower maintenance cost by consolidating duplicate role screens.
- Faster feature rollout: one shared screen change updates both roles.
- APK size reduction from release shrink/minify + asset scope + architecture trimming.

## 6) Validation checklist

- Verify admin and org-admin classes CRUD + sections CRUD.
- Verify admin and org-admin subjects CRUD.
- Build release APK/AAB and compare file size before/after.
- Smoke test role permissions and campus scoping.

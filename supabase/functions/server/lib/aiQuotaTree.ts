// supabase/functions/server/lib/aiQuotaTree.ts
// Canonical pool-distribution resolver for STUDENT quota — the single place
// this math happens, used by both real-time enforcement (aiQuota.ts) and the
// admin hierarchy UI (aiTutorAdmin.ts), so they can never disagree.
//
// Model: daily_requests / monthly_requests / daily_tokens / monthly_tokens
// are a shared pool that starts at the global default and divides downward
// (global → organization → campus → class → section → student). At each
// level: a node with its own explicit value gets exactly that amount (taken
// off the top of its parent's pool) as long as it has at least one AI-enabled
// student under it; everything else splits the remainder pro-rata by active
// (AI-enabled) student count. max_input_tokens / max_output_tokens are
// per-request caps, not a budget, so they stay "closest explicit scope wins"
// with no division.
import { getDb } from "../_shared.ts";

export const POOLED_FIELDS = ["daily_requests", "monthly_requests", "daily_tokens", "monthly_tokens"] as const;
export const CAP_FIELDS = ["max_input_tokens", "max_output_tokens"] as const;
export type PooledField = typeof POOLED_FIELDS[number];
export type CapField = typeof CAP_FIELDS[number];

type ScopeType = "global" | "organization" | "campus" | "class" | "section" | "student";
type Row = Record<string, unknown>;

export interface FieldEffect {
  value: number | null;
  source: "manual" | "auto" | "none";
  from_type: string;
  from_name: string;
  share_basis?: {
    my_students: number;
    non_manual_students: number;
    parent_pool: number | null;
    manual_sum: number;
    remaining: number | null;
  };
}

function numericOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function polKey(t: string, sid: number | null) {
  return `${t}#${sid ?? "null"}`;
}

/** Loads every entity + flag + student-policy row once, and exposes helpers
 * to compute effective pooled/cap values for any node in the tree. */
export async function loadQuotaTree() {
  const db = getDb();
  const [orgsRes, schoolsRes, classesRes, sectionsRes, studentsRes, flagsRes, policiesRes] = await Promise.all([
    db.from("organizations").select("id, name"),
    db.from("schools").select("id, name, org_id"),
    db.from("classes").select("id, class_name, school_id"),
    db.from("sections").select("id, section_name, class_id"),
    // Join through classes so a stale students.school_id can't miscount who
    // belongs where — classes.school_id is the corrected source of truth
    // (matches resolveStudentScope in aiScope.ts).
    db.from("students").select("id, school_id, class_id, section_id, classes:class_id(school_id)"),
    db.from("ai_feature_flags").select("scope_type, scope_id, is_enabled"),
    db.from("ai_quota_policies").select("*").eq("actor_type", "student"),
  ]);

  const orgs = new Map<number, { id: number; name: string }>();
  for (const r of (orgsRes.data || []) as Row[]) orgs.set(Number(r.id), { id: Number(r.id), name: String(r.name) });

  const schools = new Map<number, { id: number; name: string; org_id: number | null }>();
  for (const r of (schoolsRes.data || []) as Row[]) schools.set(Number(r.id), { id: Number(r.id), name: String(r.name), org_id: r.org_id as number | null });

  const classes = new Map<number, { id: number; name: string; school_id: number }>();
  for (const r of (classesRes.data || []) as Row[]) classes.set(Number(r.id), { id: Number(r.id), name: String(r.class_name), school_id: Number(r.school_id) });

  const sections = new Map<number, { id: number; name: string; class_id: number }>();
  for (const r of (sectionsRes.data || []) as Row[]) sections.set(Number(r.id), { id: Number(r.id), name: String(r.section_name), class_id: Number(r.class_id) });

  const students = new Map<number, { id: number; school_id: number; class_id: number; section_id: number }>();
  for (const r of (studentsRes.data || []) as Row[]) {
    const correctedSchoolId = ((r.classes as Row | null)?.school_id as number | undefined) ?? Number(r.school_id);
    students.set(Number(r.id), {
      id: Number(r.id),
      school_id: correctedSchoolId,
      class_id: Number(r.class_id),
      section_id: Number(r.section_id),
    });
  }

  const flagMap = new Map<string, boolean>();
  for (const f of (flagsRes.data || []) as Row[]) flagMap.set(polKey(String(f.scope_type), f.scope_id as number | null), Boolean(f.is_enabled));

  const policyMap = new Map<string, Row>();
  for (const p of (policiesRes.data || []) as Row[]) policyMap.set(polKey(String(p.scope_type), p.scope_id as number | null), p);

  // AI-enabled per student: closest explicit flag wins, walking most-specific
  // to least-specific (matches aiScope.ts's getEffectiveAiAccess).
  const studentEnabled = new Map<number, boolean>();
  for (const st of students.values()) {
    const orgId = schools.get(st.school_id)?.org_id ?? null;
    const chain: Array<[string, number | null]> = [
      ["student", st.id], ["section", st.section_id], ["class", st.class_id],
      ["campus", st.school_id], ["organization", orgId], ["global", null],
    ];
    let enabled = true; // default when nothing is set anywhere
    for (const [t, id] of chain) {
      if (flagMap.has(polKey(t, id))) { enabled = flagMap.get(polKey(t, id))!; break; }
    }
    studentEnabled.set(st.id, enabled);
  }

  const countActive = (type: ScopeType, id: number | null): number => {
    if (type === "global") { let n = 0; for (const v of studentEnabled.values()) if (v) n++; return n; }
    if (type === "student") return id !== null && studentEnabled.get(id) ? 1 : 0;
    if (type === "section" && id !== null) { let n = 0; for (const st of students.values()) if (st.section_id === id && studentEnabled.get(st.id)) n++; return n; }
    if (type === "class" && id !== null) { let n = 0; for (const st of students.values()) if (st.class_id === id && studentEnabled.get(st.id)) n++; return n; }
    if (type === "campus" && id !== null) { let n = 0; for (const st of students.values()) if (st.school_id === id && studentEnabled.get(st.id)) n++; return n; }
    if (type === "organization" && id !== null) {
      const sids = new Set<number>();
      for (const s of schools.values()) if (s.org_id === id) sids.add(s.id);
      let n = 0; for (const st of students.values()) if (sids.has(st.school_id) && studentEnabled.get(st.id)) n++; return n;
    }
    return 0;
  };

  const childEntities = (parentType: ScopeType, parentId: number | null): Array<{ type: ScopeType; id: number; name: string }> => {
    if (parentType === "global") return Array.from(orgs.values()).map((o) => ({ type: "organization" as ScopeType, id: o.id, name: o.name }));
    if (parentType === "organization" && parentId !== null) return Array.from(schools.values()).filter((s) => s.org_id === parentId).map((s) => ({ type: "campus" as ScopeType, id: s.id, name: s.name }));
    if (parentType === "campus" && parentId !== null) return Array.from(classes.values()).filter((c) => c.school_id === parentId).map((c) => ({ type: "class" as ScopeType, id: c.id, name: c.name }));
    if (parentType === "class" && parentId !== null) return Array.from(sections.values()).filter((s) => s.class_id === parentId).map((s) => ({ type: "section" as ScopeType, id: s.id, name: s.name }));
    if (parentType === "section" && parentId !== null) return Array.from(students.values()).filter((st) => st.section_id === parentId).map((st) => ({ type: "student" as ScopeType, id: st.id, name: `Student #${st.id}` }));
    return [];
  };

  // Ancestor chain (global first, node itself last) for any scope.
  const ancestorChain = (type: ScopeType, id: number | null): Array<{ type: ScopeType; id: number | null; name: string }> => {
    const chain: Array<{ type: ScopeType; id: number | null; name: string }> = [{ type: "global", id: null, name: "Everyone (global default)" }];
    if (type === "global") return chain;

    let orgId: number | null = null, campusId: number | null = null, classId: number | null = null, sectionId: number | null = null;
    if (type === "organization") orgId = id;
    if (type === "campus") { campusId = id; orgId = id !== null ? (schools.get(id)?.org_id ?? null) : null; }
    if (type === "class") { classId = id; const c = id !== null ? classes.get(id) : null; campusId = c?.school_id ?? null; orgId = campusId !== null ? (schools.get(campusId)?.org_id ?? null) : null; }
    if (type === "section") { sectionId = id; const sec = id !== null ? sections.get(id) : null; classId = sec?.class_id ?? null; const c = classId !== null ? classes.get(classId) : null; campusId = c?.school_id ?? null; orgId = campusId !== null ? (schools.get(campusId)?.org_id ?? null) : null; }
    if (type === "student") { const st = id !== null ? students.get(id) : null; sectionId = st?.section_id ?? null; classId = st?.class_id ?? null; campusId = st?.school_id ?? null; orgId = campusId !== null ? (schools.get(campusId)?.org_id ?? null) : null; }

    if (orgId !== null) chain.push({ type: "organization", id: orgId, name: orgs.get(orgId)?.name ? `Org: ${orgs.get(orgId)!.name}` : `Org #${orgId}` });
    if (campusId !== null && type !== "organization") chain.push({ type: "campus", id: campusId, name: schools.get(campusId)?.name ? `Campus: ${schools.get(campusId)!.name}` : `Campus #${campusId}` });
    if (classId !== null && type !== "campus" && type !== "organization") chain.push({ type: "class", id: classId, name: classes.get(classId)?.name ? `Class: ${classes.get(classId)!.name}` : `Class #${classId}` });
    if (sectionId !== null && type === "student") chain.push({ type: "section", id: sectionId, name: sections.get(sectionId)?.name ? `Section: ${sections.get(sectionId)!.name}` : `Section #${sectionId}` });
    if (type !== "global") chain.push({ type, id, name: `${type} #${id}` });
    return chain;
  };

  const ownPolicy = (type: ScopeType, id: number | null) => policyMap.get(polKey(type, id)) || null;

  /** Effective value for the CAP fields (closest explicit scope wins, no pooling). */
  const effectiveCap = (type: ScopeType, id: number | null, field: CapField): { value: number | null; from_type: string; from_name: string; is_override: boolean } => {
    const chain = ancestorChain(type, id);
    for (let i = chain.length - 1; i >= 0; i--) {
      const pol = ownPolicy(chain[i].type, chain[i].id);
      const v = pol ? numericOrNull(pol[field]) : null;
      if (v !== null) return { value: v, from_type: chain[i].type, from_name: chain[i].name, is_override: i === chain.length - 1 };
    }
    return { value: null, from_type: "none", from_name: "unlimited", is_override: false };
  };

  /** Effective pooled value for a node, walking global → ... → node. Also
   * returns the same for every child of that node one level deeper, so the
   * admin UI can show a full picture in one call. */
  const effectivePooled = (targetType: ScopeType, targetId: number | null, field: PooledField): FieldEffect => {
    const chain = ancestorChain(targetType, targetId);
    let current: FieldEffect = { value: null, source: "none", from_type: "none", from_name: "unlimited" };

    for (let i = 0; i < chain.length; i++) {
      const node = chain[i];
      const pol = ownPolicy(node.type, node.id);
      const manualVal = pol ? numericOrNull(pol[field]) : null;
      const myActive = countActive(node.type, node.id);

      if (manualVal !== null) {
        current = { value: myActive > 0 ? manualVal : 0, source: "manual", from_type: node.type, from_name: node.name };
        continue;
      }
      if (i === 0) {
        // Global with no explicit value anywhere = unlimited.
        current = { value: null, source: "none", from_type: "none", from_name: "unlimited" };
        continue;
      }
      const parent = chain[i - 1];
      const parentPool = current.value;
      if (parentPool === null) {
        current = { value: null, source: "none", from_type: "none", from_name: "unlimited" };
        continue;
      }
      const siblings = childEntities(parent.type, parent.id);
      let manualSum = 0, nonManualStudents = 0;
      for (const sib of siblings) {
        const sibPol = ownPolicy(sib.type, sib.id);
        const sibManual = sibPol ? numericOrNull(sibPol[field]) : null;
        const sibActive = countActive(sib.type, sib.id);
        if (sibManual !== null && sibActive > 0) manualSum += sibManual;
        else nonManualStudents += sibActive;
      }
      const remaining = Math.max(0, parentPool - manualSum);
      const share = (nonManualStudents > 0 && myActive > 0) ? Math.floor(remaining * myActive / nonManualStudents) : 0;
      current = {
        value: share, source: "auto", from_type: parent.type, from_name: parent.name,
        share_basis: { my_students: myActive, non_manual_students: nonManualStudents, parent_pool: parentPool, manual_sum: manualSum, remaining },
      };
    }
    return current;
  };

  return { orgs, schools, classes, sections, students, countActive, childEntities, ancestorChain, ownPolicy, effectiveCap, effectivePooled };
}

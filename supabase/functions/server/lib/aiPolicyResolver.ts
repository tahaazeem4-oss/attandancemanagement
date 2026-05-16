// Shared resolver: computes the parent-node's effective pool and the sum of
// other sibling manual overrides for a candidate (scope_type, scope_id) at
// which someone is trying to set a quota policy. All entity / flag / policy
// data is fetched in a small fixed number of queries up-front so this stays
// fast regardless of tree size.

export const DISTRIBUTABLE = [
  "daily_requests","weekly_requests","monthly_requests",
  "daily_tokens","weekly_tokens","monthly_tokens",
] as const;
export const NON_DISTRIBUTABLE = ["max_input_tokens","max_output_tokens"] as const;
export const ALL_FIELDS = [...DISTRIBUTABLE, ...NON_DISTRIBUTABLE] as const;
export type PolicyField = typeof ALL_FIELDS[number];

type ScopeType = "global"|"organization"|"campus"|"class"|"section"|"student";

// deno-lint-ignore no-explicit-any
type DB = any;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export interface ParentPoolResult {
  parentNode: { type: ScopeType; id: number | null; name: string };
  parentEffective: Record<PolicyField, number | null>;
  siblingManualSum: Record<PolicyField, number>;
  perRequestCap: Record<PolicyField, number | null>;
}

const polKey = (t: string, sid: number | null) => `${t}#${sid ?? "null"}`;

async function loadTree(db: DB) {
  const [schoolsRes, orgsRes, classesRes, sectionsRes, studentsRes, flagsRes, policiesRes] = await Promise.all([
    db.from("schools").select("id, name, org_id"),
    db.from("organizations").select("id, name"),
    db.from("classes").select("id, class_name, school_id"),
    db.from("sections").select("id, section_name, class_id"),
    db.from("students").select("id, section_id, class_id, school_id"),
    db.from("ai_feature_flags").select("scope_type, scope_id, is_enabled"),
    db.from("ai_quota_policies").select("*"),
  ]);

  const orgs    = new Map<number, { id: number; name: string }>();
  const schools = new Map<number, { id: number; name: string; org_id: number | null }>();
  const classes = new Map<number, { id: number; class_name: string; school_id: number }>();
  const sections = new Map<number, { id: number; section_name: string; class_id: number }>();
  const students = new Map<number, { id: number; section_id: number; class_id: number; school_id: number }>();
  const flagMap = new Map<string, boolean>();
  const policyMap = new Map<string, Row>();

  for (const r of (orgsRes.data || []) as Row[]) orgs.set(Number(r.id), { id: Number(r.id), name: String(r.name) });
  for (const r of (schoolsRes.data || []) as Row[]) schools.set(Number(r.id), { id: Number(r.id), name: String(r.name), org_id: r.org_id as number | null });
  for (const r of (classesRes.data || []) as Row[]) classes.set(Number(r.id), { id: Number(r.id), class_name: String(r.class_name), school_id: Number(r.school_id) });
  for (const r of (sectionsRes.data || []) as Row[]) sections.set(Number(r.id), { id: Number(r.id), section_name: String(r.section_name), class_id: Number(r.class_id) });
  for (const r of (studentsRes.data || []) as Row[]) students.set(Number(r.id), {
    id: Number(r.id), section_id: Number(r.section_id), class_id: Number(r.class_id), school_id: Number(r.school_id),
  });
  for (const f of (flagsRes.data || []) as Row[]) flagMap.set(polKey(String(f.scope_type), f.scope_id as number | null), Boolean(f.is_enabled));
  for (const p of (policiesRes.data || []) as Row[]) policyMap.set(polKey(String(p.scope_type), p.scope_id as number | null), p);

  const globalOn = flagMap.has(polKey("global", null)) ? flagMap.get(polKey("global", null))! : true;

  const studentEnabled = new Map<number, boolean>();
  for (const st of students.values()) {
    const orgId = schools.get(st.school_id)?.org_id ?? null;
    let on = globalOn;
    const steps: Array<[string, number | null]> = [
      ["organization", orgId], ["campus", st.school_id],
      ["class", st.class_id], ["section", st.section_id], ["student", st.id],
    ];
    for (const [t, sid] of steps) {
      const k = polKey(t, sid);
      if (flagMap.has(k)) on = flagMap.get(k)!;
    }
    studentEnabled.set(st.id, on);
  }

  const countEnabled = (type: ScopeType, id: number | null): number => {
    if (type === "global") { let n = 0; for (const v of studentEnabled.values()) if (v) n++; return n; }
    if (type === "student") return id !== null && studentEnabled.get(id) ? 1 : 0;
    if (type === "section" && id !== null) { let n = 0; for (const st of students.values()) if (st.section_id === id && studentEnabled.get(st.id)) n++; return n; }
    if (type === "class"   && id !== null) { let n = 0; for (const st of students.values()) if (st.class_id   === id && studentEnabled.get(st.id)) n++; return n; }
    if (type === "campus"  && id !== null) { let n = 0; for (const st of students.values()) if (st.school_id  === id && studentEnabled.get(st.id)) n++; return n; }
    if (type === "organization" && id !== null) {
      const sids = new Set<number>();
      for (const s of schools.values()) if (s.org_id === id) sids.add(s.id);
      let n = 0; for (const st of students.values()) if (sids.has(st.school_id) && studentEnabled.get(st.id)) n++; return n;
    }
    return 0;
  };

  const childEntities = (parentType: ScopeType, parentId: number | null): Array<{ type: ScopeType; id: number }> => {
    if (parentType === "global") return Array.from(orgs.values()).map((o) => ({ type: "organization" as ScopeType, id: o.id }));
    if (parentType === "organization" && parentId !== null) return Array.from(schools.values()).filter((s) => s.org_id === parentId).map((s) => ({ type: "campus" as ScopeType, id: s.id }));
    if (parentType === "campus" && parentId !== null) return Array.from(classes.values()).filter((c) => c.school_id === parentId).map((c) => ({ type: "class" as ScopeType, id: c.id }));
    if (parentType === "class" && parentId !== null) return Array.from(sections.values()).filter((s) => s.class_id === parentId).map((s) => ({ type: "section" as ScopeType, id: s.id }));
    if (parentType === "section" && parentId !== null) return Array.from(students.values()).filter((st) => st.section_id === parentId).map((st) => ({ type: "student" as ScopeType, id: st.id }));
    return [];
  };

  const buildAncestors = (scope_type: ScopeType, scope_id: number | null) => {
    const chain: Array<{ type: ScopeType; id: number | null; name: string }> = [
      { type: "global", id: null, name: "Everyone (global default)" },
    ];
    if (scope_type === "global" || scope_type === "organization") return chain;

    let orgId: number | null = null;
    let campusId: number | null = null;
    let classId: number | null = null;
    let sectionId: number | null = null;

    if (scope_type === "campus")  { campusId = scope_id; }
    if (scope_type === "class")   { const c = scope_id ? classes.get(scope_id) : null; campusId = c?.school_id ?? null; }
    if (scope_type === "section") { const sec = scope_id ? sections.get(scope_id) : null; classId = sec?.class_id ?? null; const c = classId ? classes.get(classId) : null; campusId = c?.school_id ?? null; }
    if (scope_type === "student") { const st = scope_id ? students.get(scope_id) : null; sectionId = st?.section_id ?? null; classId = st?.class_id ?? null; campusId = st?.school_id ?? null; }
    if (campusId) orgId = schools.get(campusId)?.org_id ?? null;

    if (orgId)     chain.push({ type: "organization", id: orgId,     name: `Org: ${orgs.get(orgId)?.name ?? `#${orgId}`}` });
    if (campusId && scope_type !== "campus")                                chain.push({ type: "campus", id: campusId, name: `Campus: ${schools.get(campusId)?.name ?? `#${campusId}`}` });
    if (classId  && scope_type !== "class"   && scope_type !== "campus")    chain.push({ type: "class", id: classId, name: `Class: ${classes.get(classId)?.class_name ?? `#${classId}`}` });
    if (sectionId && scope_type === "student")                              chain.push({ type: "section", id: sectionId, name: `Section: ${sections.get(sectionId)?.section_name ?? `#${sectionId}`}` });
    return chain;
  };

  return { orgs, schools, classes, sections, students, flagMap, policyMap, studentEnabled, countEnabled, childEntities, buildAncestors };
}

export async function resolveParentPoolFor(
  db: DB, scope_type: ScopeType, scope_id: number | null,
): Promise<ParentPoolResult | null> {
  if (scope_type === "global") return null;

  const T = await loadTree(db);
  const ancestors = T.buildAncestors(scope_type, scope_id);
  if (!ancestors.length) return null;
  const parentNode = ancestors[ancestors.length - 1];

  const init = (): Record<PolicyField, number | null> => {
    const m = {} as Record<PolicyField, number | null>;
    for (const f of ALL_FIELDS) m[f] = null;
    return m;
  };
  let current = init();
  const perRequestCap = init();

  for (let i = 0; i < ancestors.length; i++) {
    const node = ancestors[i];
    const ownPol = T.policyMap.get(polKey(node.type, node.id));
    const next = init();
    for (const F of ALL_FIELDS) {
      const ownVal = ownPol ? (ownPol[F] as number | null | undefined) : null;
      if (ownVal !== null && ownVal !== undefined) {
        next[F] = Number(ownVal);
      } else if (i === 0) {
        next[F] = null;
      } else if ((NON_DISTRIBUTABLE as readonly string[]).includes(F)) {
        next[F] = current[F];
      } else {
        const parentPool = current[F];
        if (parentPool === null) {
          next[F] = null;
        } else {
          const parent = ancestors[i - 1];
          const siblings = T.childEntities(parent.type, parent.id);
          let manualSum = 0;
          let nonManualStudents = 0;
          const myStudents = T.countEnabled(node.type, node.id);
          for (const sib of siblings) {
            const sp = T.policyMap.get(polKey(sib.type, sib.id));
            const sv = sp ? (sp[F] as number | null | undefined) : null;
            if (sv !== null && sv !== undefined) manualSum += Number(sv);
            else nonManualStudents += T.countEnabled(sib.type, sib.id);
          }
          const remaining = Math.max(0, parentPool - manualSum);
          next[F] = nonManualStudents > 0 ? Math.floor(remaining * myStudents / nonManualStudents) : 0;
        }
      }
      if ((NON_DISTRIBUTABLE as readonly string[]).includes(F)) {
        const v = next[F];
        if (v !== null) perRequestCap[F] = perRequestCap[F] === null ? v : Math.min(perRequestCap[F] as number, v);
      }
    }
    current = next;
  }

  const parentEffective = current;

  const siblings = T.childEntities(parentNode.type, parentNode.id);
  const siblingManualSum: Record<PolicyField, number> = {} as Record<PolicyField, number>;
  for (const F of ALL_FIELDS) siblingManualSum[F] = 0;
  for (const sib of siblings) {
    if (sib.type === scope_type && sib.id === scope_id) continue;
    const sp = T.policyMap.get(polKey(sib.type, sib.id));
    if (!sp) continue;
    for (const F of DISTRIBUTABLE) {
      const sv = sp[F] as number | null | undefined;
      if (sv !== null && sv !== undefined) siblingManualSum[F] += Number(sv);
    }
  }

  return { parentNode, parentEffective, siblingManualSum, perRequestCap };
}

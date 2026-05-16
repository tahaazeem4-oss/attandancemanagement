// Shared resolver: computes the parent-node's effective pool and the sum of
// other sibling manual overrides for a candidate (scope_type, scope_id) at
// which someone is trying to set a quota policy. Used by POST /quota-policy
// to enforce "you can never allocate more than the parent has available".

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
  parentEffective: Record<PolicyField, number | null>; // distributable: parent's allocated pool. non-distributable: parent's cap.
  siblingManualSum: Record<PolicyField, number>;       // sum over OTHER siblings (excluding target node).
  perRequestCap: Record<PolicyField, number | null>;   // strictest cap ALONG chain (for non-distributable only).
}

// Build the ancestor chain (excluding the target) from global down to parent.
async function buildAncestors(db: DB, scope_type: ScopeType, scope_id: number | null):
  Promise<Array<{ type: ScopeType; id: number | null; name: string }>>
{
  const out: Array<{ type: ScopeType; id: number | null; name: string }> =
    [{ type: "global", id: null, name: "Everyone (global default)" }];
  if (scope_type === "global") return out;

  if (scope_type === "organization") return out;

  // Need org/school/class/section to walk up.
  if (scope_type === "campus") {
    const { data: s } = await db.from("schools").select("id, name, org_id").eq("id", scope_id).maybeSingle();
    if (s?.org_id) {
      const { data: o } = await db.from("organizations").select("id, name").eq("id", s.org_id).maybeSingle();
      if (o) out.push({ type: "organization", id: o.id, name: `Org: ${o.name}` });
    }
    return out;
  }
  if (scope_type === "class") {
    const { data: c } = await db.from("classes").select("id, class_name, school_id").eq("id", scope_id).maybeSingle();
    if (c?.school_id) {
      const { data: s } = await db.from("schools").select("id, name, org_id").eq("id", c.school_id).maybeSingle();
      if (s?.org_id) {
        const { data: o } = await db.from("organizations").select("id, name").eq("id", s.org_id).maybeSingle();
        if (o) out.push({ type: "organization", id: o.id, name: `Org: ${o.name}` });
      }
      if (s) out.push({ type: "campus", id: s.id, name: `Campus: ${s.name}` });
    }
    return out;
  }
  if (scope_type === "section") {
    const { data: sec } = await db.from("sections").select("id, section_name, class_id").eq("id", scope_id).maybeSingle();
    if (sec?.class_id) {
      const ancestors = await buildAncestors(db, "class", sec.class_id);
      ancestors.push({ type: "class", id: sec.class_id, name: `Class #${sec.class_id}` });
      return ancestors;
    }
    return out;
  }
  if (scope_type === "student") {
    const { data: st } = await db.from("students").select("id, first_name, last_name, section_id").eq("id", scope_id).maybeSingle();
    if (st?.section_id) {
      const ancestors = await buildAncestors(db, "section", st.section_id);
      ancestors.push({ type: "section", id: st.section_id, name: `Section #${st.section_id}` });
      return ancestors;
    }
    return out;
  }
  return out;
}

// Count AI-enabled students under an entity (flag-aware).
async function countEnabledStudents(db: DB, type: ScopeType, id: number | null): Promise<number> {
  if (type === "global") {
    // Fetch all students + all flags, resolve effective per student.
    const { data: students } = await db.from("students").select("id, section_id, class_id, school_id");
    const { data: schools }  = await db.from("schools").select("id, org_id");
    const schoolOrg = new Map<number, number | null>(((schools || []) as Row[]).map((r) => [Number(r.id), r.org_id as number | null]));
    const { data: flags } = await db.from("ai_feature_flags").select("scope_type, scope_id, is_enabled");
    const key = (t: string, sid: number | null) => `${t}#${sid ?? "null"}`;
    const flagMap = new Map<string, boolean>();
    for (const f of (flags || []) as Row[]) flagMap.set(key(String(f.scope_type), f.scope_id as number | null), Boolean(f.is_enabled));
    const globalOn = flagMap.has(key("global", null)) ? flagMap.get(key("global", null))! : true;
    let n = 0;
    for (const s of (students || []) as Row[]) {
      const orgId = schoolOrg.get(Number(s.school_id)) ?? null;
      let on = globalOn;
      const chain: Array<[string, number | null]> = [
        ["organization", orgId], ["campus", Number(s.school_id)],
        ["class", Number(s.class_id)], ["section", Number(s.section_id)], ["student", Number(s.id)],
      ];
      for (const [t, sid] of chain) {
        const k = key(t, sid);
        if (flagMap.has(k)) on = flagMap.get(k)!;
      }
      if (on) n++;
    }
    return n;
  }
  // For non-global entities, count under that entity.
  if (type === "student") return id !== null ? 1 : 0;
  let studentQuery = db.from("students").select("id, section_id, class_id, school_id");
  if (type === "section") studentQuery = studentQuery.eq("section_id", id);
  else if (type === "class") studentQuery = studentQuery.eq("class_id", id);
  else if (type === "campus") studentQuery = studentQuery.eq("school_id", id);
  else if (type === "organization") {
    const { data: schools } = await db.from("schools").select("id").eq("org_id", id);
    const sids = ((schools || []) as Row[]).map((r) => Number(r.id));
    if (!sids.length) return 0;
    studentQuery = studentQuery.in("school_id", sids);
  }
  const { data: students } = await studentQuery;
  if (!students || !students.length) return 0;

  // Resolve per-student effective flag walking chain.
  const { data: flags } = await db.from("ai_feature_flags").select("scope_type, scope_id, is_enabled");
  const key = (t: string, sid: number | null) => `${t}#${sid ?? "null"}`;
  const flagMap = new Map<string, boolean>();
  for (const f of (flags || []) as Row[]) flagMap.set(key(String(f.scope_type), f.scope_id as number | null), Boolean(f.is_enabled));
  const globalOn = flagMap.has(key("global", null)) ? flagMap.get(key("global", null))! : true;
  const { data: schools } = await db.from("schools").select("id, org_id");
  const schoolOrg = new Map<number, number | null>(((schools || []) as Row[]).map((r) => [Number(r.id), r.org_id as number | null]));
  let n = 0;
  for (const s of (students as Row[])) {
    const orgId = schoolOrg.get(Number(s.school_id)) ?? null;
    let on = globalOn;
    const chain: Array<[string, number | null]> = [
      ["organization", orgId], ["campus", Number(s.school_id)],
      ["class", Number(s.class_id)], ["section", Number(s.section_id)], ["student", Number(s.id)],
    ];
    for (const [t, sid] of chain) {
      const k = key(t, sid);
      if (flagMap.has(k)) on = flagMap.get(k)!;
    }
    if (on) n++;
  }
  return n;
}

// Find sibling entities of (scope_type, scope_id) under the same parent.
async function siblingsOf(db: DB, scope_type: ScopeType, scope_id: number | null):
  Promise<Array<{ type: ScopeType; id: number }>>
{
  if (scope_type === "organization") {
    const { data } = await db.from("organizations").select("id");
    return ((data || []) as Row[]).map((r) => ({ type: "organization" as ScopeType, id: Number(r.id) }));
  }
  if (scope_type === "campus") {
    const { data: s } = await db.from("schools").select("org_id").eq("id", scope_id).maybeSingle();
    const orgId = s?.org_id;
    if (!orgId) return [];
    const { data } = await db.from("schools").select("id").eq("org_id", orgId);
    return ((data || []) as Row[]).map((r) => ({ type: "campus" as ScopeType, id: Number(r.id) }));
  }
  if (scope_type === "class") {
    const { data: c } = await db.from("classes").select("school_id").eq("id", scope_id).maybeSingle();
    if (!c?.school_id) return [];
    const { data } = await db.from("classes").select("id").eq("school_id", c.school_id);
    return ((data || []) as Row[]).map((r) => ({ type: "class" as ScopeType, id: Number(r.id) }));
  }
  if (scope_type === "section") {
    const { data: sec } = await db.from("sections").select("class_id").eq("id", scope_id).maybeSingle();
    if (!sec?.class_id) return [];
    const { data } = await db.from("sections").select("id").eq("class_id", sec.class_id);
    return ((data || []) as Row[]).map((r) => ({ type: "section" as ScopeType, id: Number(r.id) }));
  }
  if (scope_type === "student") {
    const { data: st } = await db.from("students").select("section_id").eq("id", scope_id).maybeSingle();
    if (!st?.section_id) return [];
    const { data } = await db.from("students").select("id").eq("section_id", st.section_id);
    return ((data || []) as Row[]).map((r) => ({ type: "student" as ScopeType, id: Number(r.id) }));
  }
  return [];
}

// Map entity → its parent (type+id) so we can walk down through ancestors.
async function childEntitiesUnder(db: DB, parentType: ScopeType, parentId: number | null):
  Promise<Array<{ type: ScopeType; id: number }>>
{
  if (parentType === "global") {
    const { data } = await db.from("organizations").select("id");
    return ((data || []) as Row[]).map((r) => ({ type: "organization" as ScopeType, id: Number(r.id) }));
  }
  if (parentType === "organization") {
    const { data } = await db.from("schools").select("id").eq("org_id", parentId);
    return ((data || []) as Row[]).map((r) => ({ type: "campus" as ScopeType, id: Number(r.id) }));
  }
  if (parentType === "campus") {
    const { data } = await db.from("classes").select("id").eq("school_id", parentId);
    return ((data || []) as Row[]).map((r) => ({ type: "class" as ScopeType, id: Number(r.id) }));
  }
  if (parentType === "class") {
    const { data } = await db.from("sections").select("id").eq("class_id", parentId);
    return ((data || []) as Row[]).map((r) => ({ type: "section" as ScopeType, id: Number(r.id) }));
  }
  if (parentType === "section") {
    const { data } = await db.from("students").select("id").eq("section_id", parentId);
    return ((data || []) as Row[]).map((r) => ({ type: "student" as ScopeType, id: Number(r.id) }));
  }
  return [];
}

// MAIN: parent's effective pool and other-sibling manual sums.
export async function resolveParentPoolFor(
  db: DB, scope_type: ScopeType, scope_id: number | null,
): Promise<ParentPoolResult | null> {
  if (scope_type === "global") return null; // global has no parent.
  const ancestors = await buildAncestors(db, scope_type, scope_id);
  if (!ancestors.length) return null;
  const parentNode = ancestors[ancestors.length - 1];

  // Fetch all policies (small table).
  const { data: policies } = await db.from("ai_quota_policies").select("*");
  const polKey = (t: string, sid: number | null) => `${t}#${sid ?? "null"}`;
  const policyMap = new Map<string, Row>();
  for (const p of (policies || []) as Row[]) policyMap.set(polKey(String(p.scope_type), p.scope_id as number | null), p);

  // Walk top-down through ancestors to compute each level's effective per field.
  // current[field] = effective at this ancestor.
  const init = (): Record<PolicyField, number | null> => {
    const m = {} as Record<PolicyField, number | null>;
    for (const f of ALL_FIELDS) m[f] = null;
    return m;
  };
  let current = init();
  const perRequestCap = init();

  for (let i = 0; i < ancestors.length; i++) {
    const node = ancestors[i];
    const ownPol = policyMap.get(polKey(node.type, node.id));
    const next = init();
    for (const F of ALL_FIELDS) {
      const ownVal = ownPol ? (ownPol[F] as number | null | undefined) : null;
      if (ownVal !== null && ownVal !== undefined) {
        next[F] = Number(ownVal);
      } else if (i === 0) {
        next[F] = null;
      } else if ((NON_DISTRIBUTABLE as readonly string[]).includes(F)) {
        next[F] = current[F]; // cascade.
      } else {
        // Distributable: compute share from parent's pool minus manual siblings.
        const parentPool = current[F];
        if (parentPool === null) {
          next[F] = null;
        } else {
          const parent = ancestors[i - 1];
          const siblings = await childEntitiesUnder(db, parent.type, parent.id);
          let manualSum = 0;
          let nonManualStudents = 0;
          const myStudents = await countEnabledStudents(db, node.type, node.id);
          for (const sib of siblings) {
            const sp = policyMap.get(polKey(sib.type, sib.id));
            const sv = sp ? (sp[F] as number | null | undefined) : null;
            if (sv !== null && sv !== undefined) manualSum += Number(sv);
            else nonManualStudents += await countEnabledStudents(db, sib.type, sib.id);
          }
          const remaining = Math.max(0, parentPool - manualSum);
          next[F] = nonManualStudents > 0 ? Math.floor(remaining * myStudents / nonManualStudents) : 0;
        }
      }
      // Track strictest cap along chain for non-distributable.
      if ((NON_DISTRIBUTABLE as readonly string[]).includes(F)) {
        const v = next[F];
        if (v !== null) perRequestCap[F] = perRequestCap[F] === null ? v : Math.min(perRequestCap[F] as number, v);
      }
    }
    current = next;
  }

  // current now holds parent's effective per field.
  const parentEffective = current;

  // Sibling-manual sums (under parentNode, excluding the target scope).
  const siblings = await childEntitiesUnder(db, parentNode.type, parentNode.id);
  const siblingManualSum = init() as Record<PolicyField, number>;
  for (const F of ALL_FIELDS) siblingManualSum[F] = 0;
  for (const sib of siblings) {
    if (sib.type === scope_type && sib.id === scope_id) continue;
    const sp = policyMap.get(polKey(sib.type, sib.id));
    if (!sp) continue;
    for (const F of DISTRIBUTABLE) {
      const sv = sp[F] as number | null | undefined;
      if (sv !== null && sv !== undefined) siblingManualSum[F] += Number(sv);
    }
  }

  return { parentNode, parentEffective, siblingManualSum, perRequestCap };
}

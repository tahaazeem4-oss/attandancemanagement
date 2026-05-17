export const DISTRIBUTABLE = [
  "daily_requests", "weekly_requests", "monthly_requests",
  "daily_tokens", "weekly_tokens", "monthly_tokens",
] as const;

export const NON_DISTRIBUTABLE = ["max_input_tokens", "max_output_tokens"] as const;
export const ALL_FIELDS = [...DISTRIBUTABLE, ...NON_DISTRIBUTABLE] as const;

export type DistributableField = typeof DISTRIBUTABLE[number];
export type NonDistributableField = typeof NON_DISTRIBUTABLE[number];
export type PolicyField = typeof ALL_FIELDS[number];
export type AllocationMode = "inherit" | "fixed" | "percent";

type PolicyRecord = Record<string, unknown> | null | undefined;

export function modeKey(field: DistributableField): string {
  return `${field}_mode`;
}

export function percentKey(field: DistributableField): string {
  return `${field}_percent_bps`;
}

export function numericOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function getAllocationMode(policy: PolicyRecord, field: DistributableField): AllocationMode {
  const raw = typeof policy?.[modeKey(field)] === "string" ? String(policy?.[modeKey(field)]) : null;
  if (raw === "inherit" || raw === "fixed" || raw === "percent") return raw;
  return numericOrNull(policy?.[field]) !== null ? "fixed" : "inherit";
}

export function getAllocationPercentBps(policy: PolicyRecord, field: DistributableField): number | null {
  const raw = numericOrNull(policy?.[percentKey(field)]);
  return raw === null ? null : Math.max(0, Math.floor(raw));
}

export function hasExplicitAllocation(policy: PolicyRecord, field: DistributableField): boolean {
  const mode = getAllocationMode(policy, field);
  if (mode === "fixed") return numericOrNull(policy?.[field]) !== null;
  if (mode === "percent") return getAllocationPercentBps(policy, field) !== null;
  return false;
}

export function resolveExplicitAllocation(
  policy: PolicyRecord,
  field: DistributableField,
  parentPool: number | null,
): { mode: Exclude<AllocationMode, "inherit">; value: number | null; percent_bps: number | null } | null {
  const mode = getAllocationMode(policy, field);
  if (mode === "fixed") {
    const value = numericOrNull(policy?.[field]);
    return value === null ? null : { mode, value, percent_bps: null };
  }
  if (mode === "percent") {
    const percentBps = getAllocationPercentBps(policy, field);
    if (percentBps === null) return null;
    return {
      mode,
      value: parentPool === null ? null : Math.floor((parentPool * percentBps) / 10_000),
      percent_bps: percentBps,
    };
  }
  return null;
}
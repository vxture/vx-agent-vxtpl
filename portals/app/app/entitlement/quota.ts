import type { Entitlement, QuotaPool } from "./types";

// Quota/limits accessors over the C2 envelope. Limits stay an open
// `metric -> number` map with consumable `quota_pools` rather than a fixed set
// of fields, because the metric keys are the product's (vxtpl meters
// `vxtpl.chat.messages`; another product meters something else entirely) while
// the accessors below are shared.

export const UNLIMITED = -1;

export function isUnlimited(limit: number): boolean {
  return limit === UNLIMITED;
}

/** A max-type cap (limits{}). Returns undefined if the product has no such cap. */
export function limitOf(e: Entitlement, metricKey: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(e.limits, metricKey)
    ? e.limits[metricKey]
    : undefined;
}

/**
 * Admission check for a max-type cap given the product's own current count.
 * -1 = unlimited. No cap present -> deny by default (fail-closed) unless the
 * product opts in with a default.
 */
export function withinCap(
  e: Entitlement,
  metricKey: string,
  currentCount: number,
  opts: { defaultWhenAbsent?: number } = {},
): boolean {
  const limit = limitOf(e, metricKey) ?? opts.defaultWhenAbsent;
  if (limit === undefined) return false;
  if (isUnlimited(limit)) return true;
  return currentCount < limit;
}

export function poolFor(e: Entitlement, metric: string): QuotaPool | undefined {
  return e.quota_pools.find((p) => p.metric === metric);
}

/** Consumable remaining for a metric pool (0 if no pool). Gate: remaining > 0. */
export function poolRemaining(e: Entitlement, metric: string): number {
  const pool = poolFor(e, metric);
  return pool ? pool.remaining : 0;
}

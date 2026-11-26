import { EMPTY_ENTITLEMENT, type Entitlement, type QuotaPool } from "./types";

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Tolerant envelope parse: coerce known fields, ignore unknown, default missing. */
export function parseEntitlementEnvelope(
  workspaceId: string,
  product: string,
  raw: unknown,
): Entitlement {
  const o = (raw ?? {}) as Record<string, unknown>;
  const limits: Record<string, number> = {};
  if (o.limits && typeof o.limits === "object") {
    for (const [k, v] of Object.entries(o.limits as Record<string, unknown>)) {
      if (typeof v === "number") limits[k] = v;
    }
  }
  const pools: QuotaPool[] = Array.isArray(o.quota_pools)
    ? (o.quota_pools as unknown[]).flatMap((p) => {
        if (!p || typeof p !== "object") return [];
        const pp = p as Record<string, unknown>;
        const metric = str(pp.metric);
        return metric
          ? [{ metric, limit: num(pp.limit), remaining: num(pp.remaining), priority: num(pp.priority) }]
          : [];
      })
    : [];
  return {
    ...EMPTY_ENTITLEMENT,
    workspace_id: workspaceId,
    product,
    // status kept as-is (may be an unknown future value; gating uses tier/bundled)
    status: (str(o.status) as Entitlement["status"]) ?? null,
    trial_ends_at: str(o.trial_ends_at),
    current_period_end: str(o.current_period_end),
    cancel_at_period_end: o.cancel_at_period_end === true,
    data_retention_until: str(o.data_retention_until),
    tier: (str(o.tier) as Entitlement["tier"]) ?? null,
    bundled: o.bundled === true,
    limits,
    quota_pools: pools,
  };
}

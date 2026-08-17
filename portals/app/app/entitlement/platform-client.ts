import { BRAND } from "@vxtpl/shared/brand";
import { assertInternalTarget } from "../lib/internal-target";
import { EMPTY_ENTITLEMENT, type Entitlement, type QuotaPool } from "./types";

// C2 caller (product_200 section 3, product_220 section 3). Calls the platform
// entitlement endpoint over the internal network with the shared internal-auth
// header, and parses the envelope tolerantly (unknown added fields ignored,
// missing fields defaulted). Never sends the secret to the browser.

export interface PlatformClientConfig {
  baseUrl: string;
  authToken: string;
  product: string;
}

export function getPlatformClientConfig(): PlatformClientConfig | null {
  const baseUrl = process.env.PLATFORM_API_URL;
  const authToken = process.env.PLATFORM_INTERNAL_AUTH_TOKEN;
  if (!baseUrl || !authToken) return null; // -> Mock resolver
  return { baseUrl, authToken, product: BRAND.productCode };
}

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

export async function fetchEntitlement(
  cfg: PlatformClientConfig,
  workspaceId: string,
): Promise<Entitlement> {
  const url = assertInternalTarget(
    `${cfg.baseUrl.replace(/\/$/, "")}/platform/entitlements` +
      `?workspace_id=${encodeURIComponent(workspaceId)}&product=${encodeURIComponent(cfg.product)}`,
  );
  const res = await fetch(url, {
    headers: { "x-vxture-internal-auth": cfg.authToken, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`entitlement endpoint ${res.status}`);
  return parseEntitlementEnvelope(workspaceId, cfg.product, await res.json());
}

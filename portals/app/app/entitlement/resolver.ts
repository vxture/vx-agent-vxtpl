import { BRAND } from "@vxtpl/shared/brand";
import { EMPTY_ENTITLEMENT, type Entitlement, type SubscriptionStatus, type Tier } from "./types";
import { getPlatformClientConfig } from "./platform-client";
import { PlatformEntitlementResolver } from "./platform-resolver";
import { assertMockAllowed } from "../lib/deploy-stage";

// Resolver abstraction (arda precedent). The product code depends only on this
// interface; the factory picks the real platform client or the offline Mock.

export interface EntitlementResolver {
  resolve(workspaceId: string): Promise<Entitlement>;
  invalidate(workspaceId: string): void;
}

/** Build an entitlement for tests / mock / demo. */
export function makeEntitlement(
  workspaceId: string,
  product: string,
  overrides: Partial<Entitlement> = {},
): Entitlement {
  return { ...EMPTY_ENTITLEMENT, workspace_id: workspaceId, product, ...overrides };
}

// Offline resolver: no platform dependency. Reads MOCK_TIER / MOCK_STATUS /
// MOCK_BUNDLED so local dev and the tier x status demo can drive any combination.
export class MockEntitlementResolver implements EntitlementResolver {
  constructor(private readonly product: string) {}

  async resolve(workspaceId: string): Promise<Entitlement> {
    const tier = (process.env.MOCK_TIER as Tier | undefined) ?? null;
    const status = (process.env.MOCK_STATUS as SubscriptionStatus | undefined) ?? (tier ? "active" : null);
    const bundled = process.env.MOCK_BUNDLED === "true";
    return makeEntitlement(workspaceId, this.product, { tier, status, bundled });
  }

  invalidate(): void {
    /* no cache */
  }
}

let singleton: EntitlementResolver | null = null;

export function getEntitlementResolver(): EntitlementResolver {
  if (singleton) return singleton;
  const cfg = getPlatformClientConfig();
  if (cfg) {
    singleton = new PlatformEntitlementResolver(cfg);
    return singleton;
  }
  // No platform config. On a deployed stack that is a misconfiguration, not a
  // fallback: serving mock entitlements in production would silently grant or
  // deny access on the strength of an env var.
  assertMockAllowed("entitlement (C2)", "PLATFORM_API_URL + PLATFORM_INTERNAL_AUTH_TOKEN");
  singleton = new MockEntitlementResolver(BRAND.productCode);
  return singleton;
}

// For tests: reset the memoized resolver.
export function resetResolver(): void {
  singleton = null;
}

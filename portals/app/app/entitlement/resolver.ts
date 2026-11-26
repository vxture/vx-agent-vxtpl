import { BRAND } from "@vxtpl/shared/brand";
import { EMPTY_ENTITLEMENT, type Entitlement, type SubscriptionStatus, type Tier } from "./types";
import type { WorkspaceSession } from "../auth/lib/workspace-session";
import { parseEntitlementEnvelope } from "./platform-client";
import { readCachedEntitlement } from "./platform-resolver";
import { productAuthority } from "./product-authority";

export type ActiveWorkspace = Extract<WorkspaceSession, { status: "ready" | "development" }>;

/** Build an entitlement for tests / mock / demo. */
export function makeEntitlement(
  workspaceId: string,
  product: string,
  overrides: Partial<Entitlement> = {},
): Entitlement {
  return { ...EMPTY_ENTITLEMENT, workspace_id: workspaceId, product, ...overrides };
}

/**
 * Resolves C2 using the current verified session or the offline development scope.
 * @param session - Current server-resolved workspace session.
 * @returns Entitlements for this product and workspace.
 * @throws When a signed-in request cannot authenticate or read C2.
 */
export async function readWorkspaceEntitlement(session: ActiveWorkspace): Promise<Entitlement> {
  const { workspaceId } = session;
  if (session.status === "development") {
    const tier = (process.env.MOCK_TIER as Tier | undefined) ?? null;
    const status = (process.env.MOCK_STATUS as SubscriptionStatus | undefined) ?? (tier ? "active" : null);
    const bundled = process.env.MOCK_BUNDLED === "true";
    return makeEntitlement(workspaceId, BRAND.productCode, { tier, status, bundled });
  }
  const baseUrl = process.env.PLATFORM_API_URL;
  if (!baseUrl) throw new Error("Platform authority is not configured");
  const authority = await productAuthority(baseUrl, session);
  return readCachedEntitlement(workspaceId, async () => {
    const data = await authority.entitlements();
    return parseEntitlementEnvelope(workspaceId, BRAND.productCode, data);
  });
}

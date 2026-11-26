/**
 * Reads current product authorization from the platform using an OBO ticket.
 * @package @vxtpl/app
 * @layer Application
 * @category Entitlement
 * @author AI-Generated
 * @date 2026-11-26
 */

import { BRAND } from "@vxtpl/shared/brand";
import type { WorkspaceSession } from "../auth/lib/workspace-session";
import { assertInternalTarget } from "../lib/internal-target";
import { mintS2S, PLATFORM_AUDIENCE } from "../lib/s2s-token";

export type SignedWorkspace = Extract<WorkspaceSession, { status: "ready" }>;
export type ProductAuthority = Awaited<ReturnType<typeof productAuthority>>;

export async function productAuthority(baseUrl: string, session: SignedWorkspace) {
  const orgId = session.user.activeOrg;
  const { workspaceId, sub } = session;
  const product = BRAND.productCode;
  if (!orgId) throw new Error("Workspace organization is unavailable");
  const scope = { org_id: orgId, workspace_id: workspaceId, product };
  const { claims, token } = await mintS2S(PLATFORM_AUDIENCE, { subjectToken: session.accessToken });
  if (
    claims.aud !== PLATFORM_AUDIENCE || claims.act?.sub !== product ||
    claims.mode !== "obo" || claims.scope !== "tool:vxture" || claims.sub !== sub ||
    claims.org_id !== orgId || claims.workspace_id !== workspaceId
  ) throw new Error("Platform ticket scope does not match the active session");

  async function read(path: string, requireOrganization = true): Promise<Record<string, unknown>> {
    const url = assertInternalTarget(`${baseUrl.replace(/\/$/, "")}${path}`);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Platform authority HTTP ${response.status}`);
    const data = await response.json() as Record<string, unknown> | null;
    if (!data || (requireOrganization && data.org_id !== scope.org_id) || data.workspace_id !== scope.workspace_id || data.product !== scope.product) {
      throw new Error("Platform authority returned an unexpected scope");
    }
    return data;
  }

  return {
    async entitlements(): Promise<Record<string, unknown>> {
      const query = new URLSearchParams({ workspace_id: workspaceId, product });
      const data = await read("/platform/entitlements?" + query.toString(), false);
      if (!(data.status === null || typeof data.status === "string") ||
          !(data.tier === null || typeof data.tier === "string") ||
          typeof data.bundled !== "boolean" ||
          !data.limits || typeof data.limits !== "object" || Array.isArray(data.limits) ||
          !Array.isArray(data.quota_pools)) {
        throw new Error("Invalid entitlement response");
      }
      return data;
    },
    async allowed(): Promise<boolean> {
      const data = await read("/platform/product-access");
      if (data.subject !== sub || typeof data.allowed !== "boolean") {
        throw new Error("Invalid product-access response");
      }
      return data.allowed;
    },
    async rosterSummary(): Promise<{ count: number; hasMore: boolean }> {
      const data = await read("/platform/product-roster?limit=10");
      const items: unknown[] | null = Array.isArray(data.items) ? data.items : null;
      if (
        data.authorization_mode !== "assigned_seats" || typeof data.version !== "string" || !data.version ||
        !(data.nextCursor === null || (typeof data.nextCursor === "string" && data.nextCursor.length > 0)) ||
        !items || items.length > 10 || !items.every(isRosterItem)
      ) throw new Error("Invalid product-roster response");
      return { count: items.length, hasMore: data.nextCursor !== null };
    },
  };
}

function isRosterItem(item: unknown): boolean {
  if (!item || typeof item !== "object") return false;
  const entry = item as Record<string, unknown>;
  return entry.eligible === true && typeof entry.subject === "string" &&
    /^usr_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(entry.subject) &&
    (entry.display_name === null || (typeof entry.display_name === "string" && entry.display_name.trim().length > 0));
}

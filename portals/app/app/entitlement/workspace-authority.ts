/**
 * Provides a current platform seat decision for protected product requests.
 * @package @vxtpl/app
 * @layer Application
 * @category Entitlement
 * @author AI-Generated
 * @date 2026-11-26
 */

import { readWorkspaceEntitlement, type ActiveWorkspace } from "./resolver";
import { ctaFor, hasDataAccess, hasProductAccess } from "./types";
import { productAuthority } from "./product-authority";

export async function hasWorkspaceSeat(session: ActiveWorkspace): Promise<boolean> {
  if (session.status === "development") return true;
  const baseUrl = process.env.PLATFORM_API_URL;
  if (!baseUrl) throw new Error("Platform authority is not configured");
  return (await productAuthority(baseUrl, session)).allowed();
}

export async function readWorkspaceGates(session: ActiveWorkspace) {
  const entitlement = await readWorkspaceEntitlement(session);
  const entitledToData = hasDataAccess(entitlement);
  const assigned = entitledToData && await hasWorkspaceSeat(session);
  return { entitlement, gates: {
    productAccess: assigned && hasProductAccess(entitlement),
    dataAccess: assigned,
    seatRequired: entitledToData && !assigned,
    cta: ctaFor(entitlement),
  } };
}

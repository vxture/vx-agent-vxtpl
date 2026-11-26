/**
 * Resolves the workspace identity used by interactive product surfaces.
 * @package @vxtpl/app
 * @layer Application
 * @category Session
 * @author AI-Generated
 * @date 2026-11-25
 */

import { cookies } from "next/headers";
import type { AuthUser } from "./claims";
import { getOidcConfig } from "./config";
import { getAuthContext } from "./session";
import { isDeployedStage } from "../../lib/deploy-stage";

type WorkspaceIdentity = {
  workspaceId: string;
  sub: string;
  scopeKey: string;
};
type ClosedStatus = "anonymous" | "inactive-account" | "unconfigured" | "unavailable";

export type WorkspaceSession =
  | ({ status: "ready"; user: AuthUser; accessToken: string; sessionId: string } & WorkspaceIdentity)
  | ({ status: "development" } & WorkspaceIdentity)
  | { [Status in ClosedStatus]: { status: Status } }[ClosedStatus]
  | { status: "no-workspace"; user: AuthUser };

export async function readWorkspaceSession(): Promise<WorkspaceSession> {
  const cfg = getOidcConfig();
  if (!cfg.enabled) {
    return isDeployedStage()
      ? { status: "unconfigured" }
      : { status: "development", workspaceId: "ws_local_dev", sub: "usr_local_dev", scopeKey: "development" };
  }
  if (!cfg.clientSecret || !cfg.redirectUri) return { status: "unconfigured" };

  const sessionId = (await cookies()).get(cfg.cookieName)?.value;
  if (!sessionId) return { status: "anonymous" };
  try {
    const context = await getAuthContext(cfg, sessionId);
    if (!context) return { status: "anonymous" };
    const { user, accessToken, scopeKey } = context;
    if (user.accountStatus && user.accountStatus !== "active") return { status: "inactive-account" };
    if (!user.activeWorkspace || !scopeKey) return { status: "no-workspace", user };
    return { status: "ready", user, accessToken, sessionId, workspaceId: user.activeWorkspace, sub: user.sub, scopeKey };
  } catch {
    return { status: "unavailable" };
  }
}

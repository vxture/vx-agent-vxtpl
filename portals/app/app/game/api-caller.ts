import { cookies } from "next/headers";
import { getOidcConfig } from "../auth/lib/config";
import { getAuthUser } from "../auth/lib/session";
import { isDeployedStage } from "../lib/deploy-stage";

// Caller resolution for the game APIs. Same posture as /api/chat's: the
// workspace comes from the verified session (it scopes entitlement, quota and
// every run row), never from the request - and the sub comes with it, because
// runs are personal records. The local-dev stand-ins are unreachable once
// DEPLOY_STAGE is set, exactly like the chat route's.

const DEV_WORKSPACE_ID = "ws_local_dev";
const DEV_SUB = "usr_local_dev";

export interface GameCaller {
  workspaceId: string;
  sub: string;
}

export type CallerResult = GameCaller | { error: string; status: number };

export function isCallerError(v: CallerResult): v is { error: string; status: number } {
  return "error" in v;
}

export async function resolveGameCaller(): Promise<CallerResult> {
  const cfg = getOidcConfig();
  if (!cfg.enabled) {
    if (isDeployedStage()) {
      return { error: "sign-in is not configured on this deployment (OIDC_RP_ENABLED is off)", status: 503 };
    }
    return { workspaceId: DEV_WORKSPACE_ID, sub: DEV_SUB };
  }
  const jar = await cookies();
  const rpsid = jar.get(cfg.cookieName)?.value;
  const user = rpsid ? await getAuthUser(cfg, rpsid).catch(() => null) : null;
  if (!user) return { error: "not signed in", status: 401 };
  if (user.accountStatus && user.accountStatus !== "active") {
    return { error: "account is not active", status: 403 };
  }
  if (!user.activeWorkspace) {
    return { error: "this session has no active workspace", status: 403 };
  }
  return { workspaceId: user.activeWorkspace, sub: user.sub };
}

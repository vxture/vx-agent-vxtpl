import { readWorkspaceSession } from "../auth/lib/workspace-session";
import { readWorkspaceEntitlement, type ActiveWorkspace } from "../entitlement/resolver";
import type { Entitlement } from "../entitlement/types";
import { hasWorkspaceSeat } from "../entitlement/workspace-authority";

export interface GameCaller {
  workspaceId: string;
  sub: string;
  session: ActiveWorkspace;
}

export type CallerResult = GameCaller | { error: string; status: number };

export function isCallerError(v: CallerResult): v is { error: string; status: number } {
  return "error" in v;
}

export async function resolveGameCaller(): Promise<CallerResult> {
  const session = await readWorkspaceSession();
  switch (session.status) {
    case "anonymous": return { error: "not signed in", status: 401 };
    case "inactive-account": return { error: "account is not active", status: 403 };
    case "no-workspace": return { error: "this session has no active workspace", status: 403 };
    case "unconfigured":
    case "unavailable": return { error: "workspace session is unavailable", status: 503 };
  }
  try {
    if (!await hasWorkspaceSeat(session)) return { error: "product access is not assigned", status: 403 };
    return { workspaceId: session.workspaceId, sub: session.sub, session };
  } catch {
    return { error: "product access is unavailable", status: 503 };
  }
}

/**
 * Resolves the caller for game operations governed by a C2 feature policy.
 * @returns A current seat and entitlement, or the HTTP status to return.
 */
export async function resolveGameEntitledCaller(): Promise<(GameCaller & { entitlement: Entitlement }) | Extract<CallerResult, { error: string }>> {
  const caller = await resolveGameCaller();
  if (isCallerError(caller)) return caller;
  try {
    return { ...caller, entitlement: await readWorkspaceEntitlement(caller.session) };
  } catch {
    return { error: "product entitlement is unavailable", status: 503 };
  }
}

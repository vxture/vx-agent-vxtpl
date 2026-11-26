import { NextResponse } from "next/server";
import { readWorkspaceSession } from "../../auth/lib/workspace-session";
import { readWorkspaceGates } from "../../entitlement/workspace-authority";
import type { AccessState } from "../../access/types";

// GET /api/access - the one call a product front door makes.
//
// It exists because the two facts a gate needs live in different places by
// design: identity comes from the RP session and entitlement is never in the
// token (D12 - always fetched via C2). A client fetching /auth/session and
// /api/entitlement in parallel would be reading the same session twice. Those
// two reads used to race on the ROTATING refresh token; session.ts now
// single-flights the refresh, so that is fixed at the root for every caller.
//
// Resolving once server-side still halves the Redis and JWKS work, and lets the
// gate render a single decision instead of reconciling two.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await readWorkspaceSession();
  if (session.status === "development") return reply({ status: "open", reason: "dev-no-oidc" });
  if (session.status === "unavailable") return reply({ status: "unavailable", reason: "session" }, 503);
  if (session.status !== "ready") return reply(session);

  try {
    const { entitlement, gates } = await readWorkspaceGates(session);
    return reply({ status: "authenticated", user: session.user, entitlement, gates });
  } catch {
    return reply({ status: "unavailable", reason: "entitlement" }, 503);
  }
}

function reply(state: AccessState, status = 200): Response {
  return NextResponse.json(state, { status, headers: { "cache-control": "no-store" } });
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOidcConfig } from "../lib/config";
import { deleteSession } from "../lib/session-store";
import { clearCookieOptions } from "../lib/cookie";
import { randomToken } from "../lib/pkce";
import { acceptsBrowserOrigin } from "../lib/request-origin";
import { gateFailureHref } from "../../access/destination";

// POST /auth/logout (080-rp section 2.2): destroy the local RP session, then
// navigate to the IdP with the registered client so it resolves the realm.
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const cfg = getOidcConfig();
  if (!acceptsBrowserOrigin(request, cfg.appOrigin)) return new Response(null, { status: 403 });
  if (!cfg.enabled) return new Response(null, { status: 503 });
  const jar = await cookies();
  const rpsid = jar.get(cfg.cookieName)?.value;
  try {
    if (rpsid) await deleteSession(cfg.clientId, rpsid);
  } catch {
    return new NextResponse(null, { status: 303, headers: { location: gateFailureHref(undefined, "unavailable"), "cache-control": "no-store" } });
  }

  const endSession = new URL(cfg.endSessionUrl);
  endSession.searchParams.set("client_id", cfg.clientId);
  if (cfg.postLogoutRedirectUri) {
    endSession.searchParams.set("post_logout_redirect_uri", cfg.postLogoutRedirectUri);
  }
  endSession.searchParams.set("state", randomToken(16));

  const res = NextResponse.redirect(endSession, { status: 303, headers: { "cache-control": "no-store" } });
  res.cookies.set(cfg.cookieName, "", clearCookieOptions(cfg));
  return res;
}

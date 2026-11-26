import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOidcConfig } from "../lib/config";
import { exchangeCode, TokenEndpointError, verifyToken } from "../lib/oidc";
import { takeAuthState, putSession, type RpSession } from "../lib/session-store";
import { authBindingCookieName, clearCookieOptions, isAuthState, sessionCookieOptions } from "../lib/cookie";
import { randomToken } from "../lib/pkce";
import { isInteractionRequired } from "../lib/sso";
import { gateFailureHref, type GateFailure } from "../../access/destination";
import { safeReturnTo } from "../lib/return-to";

// GET /auth/callback (080-rp section 2.3/2.5): consume the single-use state,
// exchange the code, verify id_token (nonce) + access_token, assert matching
// sub, create the RP session, set the opaque cookie, 303 to returnTo.
export const dynamic = "force-dynamic";

function gateFailureResponse(returnTo: string | undefined, reason: GateFailure): NextResponse {
  // A relative Location keeps the returning browser on its existing origin.
  return new NextResponse(null, {
    status: 303,
    headers: { location: gateFailureHref(returnTo, reason), "cache-control": "no-store" },
  });
}

export async function GET(req: Request): Promise<Response> {
  const cfg = getOidcConfig();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (!isAuthState(state) || url.searchParams.getAll("state").length !== 1) return gateFailureResponse(undefined, "callback");
  const cookie = authBindingCookieName(cfg, state);
  const binding = (await cookies()).get(cookie)?.value;
  if (!binding) return gateFailureResponse(undefined, "callback");

  function finish(response: NextResponse): NextResponse {
    response.cookies.set(cookie, "", clearCookieOptions(cfg));
    return response;
  }

  // An error response still carries our state, so consume it either way - a
  // handshake that ended in an error must not stay replayable.
  let authState: Awaited<ReturnType<typeof takeAuthState>>;
  try {
    authState = await takeAuthState(cfg.clientId, state, binding);
  } catch {
    return gateFailureResponse(undefined, "unavailable");
  }
  const reject = (reason: GateFailure = "callback") =>
    finish(gateFailureResponse(authState?.returnTo, reason));

  if (!authState || url.searchParams.getAll("code").length > 1 || url.searchParams.getAll("error").length > 1 || (code && error)) return reject();

  if (error) {
    // `login_required` and friends are the DESIGNED answer to prompt=none: the
    // IdP has no session for this browser and we told it not to ask. That is
    // information, not a failure. Return to the requested page or gate.
    if (authState.silent && isInteractionRequired(error)) {
      return finish(new NextResponse(null, { status: 303, headers: { location: safeReturnTo(authState.returnTo), "cache-control": "no-store" } }));
    }
    return reject(authState && error === "access_denied" ? "cancelled" : "callback");
  }

  if (!code) return reject();

  let tokens;
  try {
    tokens = await exchangeCode(cfg, code, authState.verifier);
  } catch (error) {
    return reject(error instanceof TokenEndpointError && error.status < 500 && error.status !== 429 ? "callback" : "unavailable");
  }
  if (!tokens.id_token) return reject();

  let idClaims;
  try {
    idClaims = await verifyToken(tokens.id_token, cfg);
  } catch {
    return reject();
  }
  if (idClaims.nonce !== authState.nonce) return reject();

  let accessClaims;
  try {
    accessClaims = await verifyToken(tokens.access_token, cfg);
  } catch {
    return reject();
  }
  if (typeof idClaims.sub !== "string" || !idClaims.sub || accessClaims.sub !== idClaims.sub) return reject();
  if (typeof idClaims.sid !== "string" || !idClaims.sid || idClaims.sid.length > 512) return reject();

  const rpsid = randomToken();
  const session: RpSession = {
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessExpiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 300),
    sid: idClaims.sid,
    sub: String(idClaims.sub),
  };
  try {
    if (!await putSession(cfg.clientId, rpsid, session, cfg.sessionTtlSeconds)) return reject();
  } catch {
    return reject("unavailable");
  }

  // returnTo is a whitelisted relative path; anchor it to the app origin.
  const res = new NextResponse(null, { status: 303, headers: { location: safeReturnTo(authState.returnTo), "cache-control": "no-store" } });
  res.cookies.set(cfg.cookieName, rpsid, sessionCookieOptions(cfg));
  return finish(res);
}

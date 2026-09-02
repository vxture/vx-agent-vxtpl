import { NextResponse } from "next/server";
import { getOidcConfig } from "../lib/config";
import { exchangeCode, verifyToken } from "../lib/oidc";
import { takeAuthState, putSession, type RpSession } from "../lib/session-store";
import { sessionCookieOptions } from "../lib/cookie";
import { randomToken } from "../lib/pkce";
import { isInteractionRequired, ssoAttemptCookieName, ssoAttemptCookieOptions } from "../lib/sso";

// GET /auth/callback (080-rp section 2.3/2.5): consume the single-use state,
// exchange the code, verify id_token (nonce) + access_token, assert matching
// sub, create the RP session, set the opaque cookie, 302 to returnTo.
export const dynamic = "force-dynamic";

function reject(msg: string): Response {
  // Do not echo untrusted input; a generic 400 avoids oracle/redirect abuse.
  return new NextResponse(`auth callback rejected: ${msg}`, { status: 400 });
}

export async function GET(req: Request): Promise<Response> {
  const cfg = getOidcConfig();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // An error response still carries our state, so consume it either way - a
  // handshake that ended in an error must not stay replayable.
  const authState = state ? await takeAuthState(cfg.clientId, state) : null;

  if (error) {
    // `login_required` and friends are the DESIGNED answer to prompt=none: the
    // IdP has no session for this browser and we told it not to ask. That is
    // information, not a failure - send the visitor where they were going and
    // let the product show its own door. The middleware's marker cookie is
    // already set, so this costs one redirect and does not repeat.
    if (authState?.silent && isInteractionRequired(error)) {
      return NextResponse.redirect(new URL(authState.returnTo, cfg.appOrigin || url.origin).toString());
    }
    return reject("authorization error");
  }

  if (!code || !state) return reject("missing code/state");
  if (!authState) return reject("unknown or replayed state");

  let tokens;
  try {
    tokens = await exchangeCode(cfg, code, authState.verifier);
  } catch {
    return reject("code exchange failed");
  }
  if (!tokens.id_token) return reject("no id_token");

  let idClaims;
  try {
    idClaims = await verifyToken(tokens.id_token, cfg);
  } catch {
    return reject("id_token invalid");
  }
  if (idClaims.nonce !== authState.nonce) return reject("nonce mismatch");

  let accessClaims;
  try {
    accessClaims = await verifyToken(tokens.access_token, cfg);
  } catch {
    return reject("access_token invalid");
  }
  if (accessClaims.sub !== idClaims.sub) return reject("sub mismatch");

  const rpsid = randomToken();
  const session: RpSession = {
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessExpiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 300),
    sid: typeof idClaims.sid === "string" ? idClaims.sid : undefined,
    sub: String(idClaims.sub),
  };
  await putSession(cfg.clientId, rpsid, session, cfg.sessionTtlSeconds);

  // returnTo is a whitelisted relative path; anchor it to the app origin.
  const dest = new URL(authState.returnTo, cfg.appOrigin || url.origin);
  const res = NextResponse.redirect(dest.toString());
  res.cookies.set(cfg.cookieName, rpsid, sessionCookieOptions(cfg));
  return res;
}

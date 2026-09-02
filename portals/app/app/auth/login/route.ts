import { NextResponse } from "next/server";
import { getOidcConfig } from "../lib/config";
import { makePkce, randomToken } from "../lib/pkce";
import { putAuthState } from "../lib/session-store";
import { safeReturnTo } from "../lib/return-to";

// GET /auth/login (080-rp section 2.3): mint PKCE(S256) + state + nonce, persist
// the handshake to Redis keyed by state (single-use), and top-level 302 to the
// IdP authorize endpoint. MUST be a top-level navigation - never iframe/XHR.
//
// `?silent=1` adds `prompt=none`: authenticate from an existing IdP session or
// answer `login_required`, but never show the visitor a login form. That is the
// whole of arriving-from-the-platform-already-signed-in - see auth/lib/sso.ts.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const cfg = getOidcConfig();
  // Without a client secret and redirect URI, the 302 below lands the user on an
  // IdP error page with no way back. Refuse here instead, where the reason is
  // visible - C1 not being provisioned yet is a deployment state, not a bug.
  const url = new URL(req.url);
  const silent = url.searchParams.get("silent") === "1";
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));

  if (!cfg.enabled || !cfg.clientSecret || !cfg.redirectUri) {
    // A silent attempt is a background round trip the visitor did not ask for,
    // so a misconfigured deployment must not answer it with a JSON error page.
    // Send them where they were going; the product's own surface reports it.
    if (silent) return NextResponse.redirect(new URL(returnTo, cfg.appOrigin || url.origin).toString());
    return NextResponse.json(
      {
        error: "sign-in is not configured on this deployment",
        detail: "OIDC_RP_ENABLED must be on, with OIDC_CLIENT_SECRET and OIDC_REDIRECT_URI set",
      },
      { status: 503 },
    );
  }
  const { verifier, challenge } = makePkce();
  const state = randomToken();
  const nonce = randomToken();
  await putAuthState(cfg.clientId, state, { verifier, nonce, returnTo, silent });

  const authorize = new URL(cfg.authorizeUrl);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", cfg.clientId);
  authorize.searchParams.set("redirect_uri", cfg.redirectUri);
  authorize.searchParams.set("scope", cfg.scopes);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("nonce", nonce);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  return NextResponse.redirect(authorize.toString());
}

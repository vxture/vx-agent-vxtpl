import { NextResponse, type NextRequest } from "next/server";

/**
 * Send an unverified visitor to the front door.
 *
 * This is a CHEAP check on purpose: presence of the RP session cookie, nothing
 * more. Middleware runs on the edge runtime, where the session store and JWKS
 * verification are not available - and even if they were, verifying on every
 * request would put a Redis read and a signature check in front of every
 * navigation. The real decision belongs to `/api/access`, which the gate calls.
 *
 * So the contract between the two layers is deliberately lopsided:
 *
 *   middleware  - "you have no cookie at all, so you certainly are not signed
 *                 in" -> gate. Cannot be fooled into letting someone in,
 *                 because a forged cookie only buys a trip to the gate, which
 *                 verifies properly.
 *   /api/access - the authority. Resolves the session, the account status, the
 *                 workspace and the entitlement, once.
 *
 * Nothing here is a security boundary. Every route that matters enforces its
 * own access (api/chat resolves the session; api/entitlement 401s; the DB layer
 * has its own least-privilege role). The middleware exists so a visitor arriving
 * at the domain meets a door instead of an empty product shell.
 */

/** Mirrors auth/lib/config.ts `defaultCookieName()`. */
function sessionCookieName(): string {
  const explicit = process.env.RP_SESSION_COOKIE_NAME;
  if (explicit) return explicit;
  return process.env.NODE_ENV === "production" ? "__Host-vx_rp_session" : "vx_rp_session";
}

export function middleware(req: NextRequest): NextResponse {
  // Sign-in not provisioned: never gate. On a developer machine this is the
  // normal state, and on a misconfigured deployment a gate would lock everyone
  // out of a product that is otherwise serving - `/api/access` reports the
  // misconfiguration instead, where an operator can see it.
  if (process.env.OIDC_RP_ENABLED !== "on") return NextResponse.next();

  if (req.cookies.has(sessionCookieName())) return NextResponse.next();

  const gate = new URL("/gate", req.url);
  // Where to come back to. `safeReturnTo` re-validates this on the login route,
  // so a crafted path cannot turn the round trip into an open redirect.
  const from = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (from !== "/") gate.searchParams.set("from", from);
  return NextResponse.redirect(gate);
}

export const config = {
  /*
   * Product surfaces only. Everything excluded here either must stay reachable
   * for the gate to work at all, or is not a page:
   *   /gate            the door itself - gating it is an infinite redirect
   *   /auth/*          the login round trip, including the callback that SETS
   *                    the cookie this middleware looks for
   *   /api/*           routes enforce their own access and answer JSON; a 302
   *                    to an HTML page would surface as a JSON parse error
   *   /_next, favicon  build output and assets
   */
  matcher: ["/((?!gate|auth|api|_next/static|_next/image|favicon.ico).*)"],
};

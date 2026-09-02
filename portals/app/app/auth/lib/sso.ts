// Silent SSO: the one-shot marker that keeps it from looping.
//
// Somebody arriving from the platform is ALREADY signed in at
// accounts.vxture.com - they just have no RP session here yet. Asking them to
// press "sign in" is asking them to re-assert something the IdP already knows,
// so the middleware sends them through `/auth/login?silent=1` first, which adds
// `prompt=none` to the authorize request. If the IdP has a session the round
// trip is invisible and they land in the product; if it does not, the IdP
// answers `login_required` and the visitor meets the door instead.
//
// The marker is what makes that safe: it is set BEFORE the attempt, so an IdP
// that keeps answering `login_required` costs one redirect, not an infinite
// loop. It is cleared on a successful callback, so the next signed-out visit
// gets a fresh attempt.
//
// This module imports NOTHING on purpose. It is read by `middleware.ts`, which
// runs on the edge runtime, and by the auth routes on node - a shared helper
// with no dependencies is the only shape that is safe in both without a
// second, drifting copy of the name.

const SSO_ATTEMPT_BASE = "vx_sso_tried";

/** ~One navigation's worth of memory: long enough to stop a loop, short enough
 * that a visitor who signs in at the platform a minute later still gets a
 * silent attempt rather than a door. */
export const SSO_ATTEMPT_TTL_SECONDS = 600;

/**
 * The marker's name, host-prefixed exactly when the session cookie is - the
 * `__Host-` prefix requires Secure, which dev over http cannot satisfy.
 * `sessionCookieName` is passed in rather than derived so the two names can
 * never disagree about which environment they are in.
 */
export function ssoAttemptCookieName(sessionCookieName: string): string {
  return sessionCookieName.startsWith("__Host-") ? `__Host-${SSO_ATTEMPT_BASE}` : SSO_ATTEMPT_BASE;
}

export interface SsoMarkerOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

export function ssoAttemptCookieOptions(sessionCookieName: string, maxAge = SSO_ATTEMPT_TTL_SECONDS): SsoMarkerOptions {
  return {
    httpOnly: true,
    secure: sessionCookieName.startsWith("__Host-"),
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

/**
 * The authorize-error codes that mean "nobody is signed in here, and I was told
 * not to ask" (OIDC core 3.1.2.6). They are the EXPECTED answer to
 * `prompt=none`, not a failure: the visitor simply has no IdP session, and the
 * product should show its door. Every other error is a real one and still
 * rejects.
 */
const INTERACTION_REQUIRED = new Set([
  "login_required",
  "interaction_required",
  "consent_required",
  "account_selection_required",
]);

export function isInteractionRequired(error: string): boolean {
  return INTERACTION_REQUIRED.has(error);
}

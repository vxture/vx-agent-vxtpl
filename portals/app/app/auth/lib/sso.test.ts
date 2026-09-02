import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SSO_ATTEMPT_TTL_SECONDS,
  isInteractionRequired,
  ssoAttemptCookieName,
  ssoAttemptCookieOptions,
} from "./sso";

// The marker must be host-prefixed exactly when the session cookie is: a
// `__Host-` cookie MUST be Secure, which dev over http cannot satisfy, and a
// marker that fails to set in dev turns the silent-SSO redirect into a loop.
test("the marker follows the session cookie into (and out of) __Host-", () => {
  assert.equal(ssoAttemptCookieName("__Host-vx_rp_session"), "__Host-vx_sso_tried");
  assert.equal(ssoAttemptCookieName("vx_rp_session"), "vx_sso_tried");
  assert.equal(ssoAttemptCookieOptions("__Host-vx_rp_session").secure, true);
  assert.equal(ssoAttemptCookieOptions("vx_rp_session").secure, false);
});

test("marker options are a short-lived, http-only, lax, site-wide cookie", () => {
  const o = ssoAttemptCookieOptions("__Host-vx_rp_session");
  assert.equal(o.httpOnly, true);
  assert.equal(o.sameSite, "lax"); // must survive the IdP -> RP top-level redirect
  assert.equal(o.path, "/");
  assert.equal(o.maxAge, SSO_ATTEMPT_TTL_SECONDS);
  // maxAge 0 is how the callback retires it on a successful sign-in.
  assert.equal(ssoAttemptCookieOptions("__Host-vx_rp_session", 0).maxAge, 0);
});

// These four are the OIDC-defined answers to prompt=none when there is nobody
// to authenticate silently (core 3.1.2.6). Treating them as failures is what
// would put a 400 in front of a visitor who has simply never signed in.
test("interaction-required errors are recognised, others are not", () => {
  for (const e of ["login_required", "interaction_required", "consent_required", "account_selection_required"]) {
    assert.equal(isInteractionRequired(e), true, e);
  }
  for (const e of ["invalid_request", "unauthorized_client", "server_error", "access_denied", ""]) {
    assert.equal(isInteractionRequired(e), false, e);
  }
});

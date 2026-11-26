import type { OidcConfig } from "./config";

// RP-session cookie options (080-rp section 2.4). The browser only ever holds
// this opaque rpsid pointer - never an OIDC token. `__Host-` prefix (prod)
// forces host-only + Secure + Path=/ with no Domain, i.e. per-app isolation.
// HttpOnly + SameSite=Lax (Lax lets the RP<->IdP top-level redirect carry it).

export interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge?: number;
}

export function sessionCookieOptions(cfg: OidcConfig): CookieOptions {
  // `__Host-` cookies MUST be Secure; in dev over http the name lacks the prefix
  // and Secure is off so the cookie is accepted.
  const secure = cfg.cookieName.startsWith("__Host-");
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: cfg.sessionTtlSeconds,
  };
}

export function clearCookieOptions(cfg: OidcConfig): CookieOptions {
  return { ...sessionCookieOptions(cfg), maxAge: 0 };
}

export function authBindingCookieName(cfg: OidcConfig, state: string): string {
  return `${cfg.cookieName}_oidc_${state}`;
}

export function isAuthState(value: string | null): value is string {
  return value !== null && /^[A-Za-z0-9_-]{43}$/.test(value);
}

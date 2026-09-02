// OIDC RP configuration, env-driven (080-rp section 2.11). All token flow runs
// server-side; the browser only ever holds the opaque RP-session cookie.

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  scopes: string;
  enabled: boolean;
  sessionTtlSeconds: number;
  cookieName: string;
  appOrigin: string;
  // Derived IdP endpoints.
  authorizeUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  userInfoUrl: string;
  endSessionUrl: string;
}

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/**
 * Cookie name. `__Host-` prefix in prod forces host-only + Secure + Path=/ (no
 * Domain), which is exactly the per-app isolation the RP session needs. In dev
 * over http the `__Host-` prefix is illegal, so fall back to a plain name.
 */
function defaultCookieName(): string {
  const explicit = env("RP_SESSION_COOKIE_NAME");
  if (explicit) return explicit;
  return env("NODE_ENV") === "production" ? "__Host-vx_rp_session" : "vx_rp_session";
}

export function getOidcConfig(): OidcConfig {
  const issuer = env("OIDC_ISSUER", "https://accounts.vxture.com").replace(/\/$/, "");
  return {
    issuer,
    clientId: env("OIDC_CLIENT_ID", "vxtpl"),
    clientSecret: env("OIDC_CLIENT_SECRET"),
    redirectUri: env("OIDC_REDIRECT_URI"),
    postLogoutRedirectUri: env("OIDC_POST_LOGOUT_REDIRECT_URI"),
    scopes: env("OIDC_SCOPES", "openid profile email phone"),
    enabled: env("OIDC_RP_ENABLED", "off") === "on",
    sessionTtlSeconds: Number(env("RP_SESSION_TTL", "2592000")),
    cookieName: defaultCookieName(),
    appOrigin: env("NEXT_PUBLIC_APP_URL", env("OIDC_REDIRECT_URI").replace(/\/auth\/callback$/, "")),
    authorizeUrl: `${issuer}/oidc/authorize`,
    tokenUrl: `${issuer}/oidc/token`,
    jwksUrl: `${issuer}/oidc/jwks`,
    // UserInfo is where the display claims actually live for this IdP: the
    // discovery document advertises name / picture / email under
    // claims_supported, but the id_token production accounts get back carries
    // none of them (live finding 2026-09-02 - the deck fell through to the sub).
    // Standard OIDC allows exactly that, so an RP that wants a person's name
    // must ask UserInfo for it rather than assume the id_token is complete.
    userInfoUrl: `${issuer}/oidc/userinfo`,
    endSessionUrl: `${issuer}/oidc/end_session`,
  };
}

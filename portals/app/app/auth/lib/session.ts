import type { OidcConfig } from "./config";
import { verifyToken, refreshTokens } from "./oidc";
import { getSession, putSession, type RpSession } from "./session-store";
import { toAuthUser, type AccessClaims, type AuthUser } from "./claims";

// Per-request auth (080-rp section 2.6 / 2.9): rpsid -> session -> silent refresh
// if the access token is near expiry (token rotation: new refresh stored, old
// invalidated) -> verify access token -> AuthUser. Returns null when there is no
// valid session (caller 401s XHR / 302s a page to /auth/login).

const REFRESH_SKEW_SECONDS = 60;

export async function getAuthUser(cfg: OidcConfig, rpsid: string): Promise<AuthUser | null> {
  return (await getAuthContext(cfg, rpsid))?.user ?? null;
}

/**
 * The same resolution, keeping the verified access token alongside the user.
 *
 * The raw token is needed for on-behalf-of S2S exchange (lib/s2s-token.ts): the
 * platform reads workspace and subject FROM the presented token rather than
 * trusting the request body, which is what makes OBO safe - and is also why the
 * token cannot be reconstructed from AuthUser. It stays server-side; nothing
 * here ever puts it on a response.
 */
export async function getAuthContext(
  cfg: OidcConfig,
  rpsid: string,
): Promise<{ user: AuthUser; accessToken: string } | null> {
  let session = await getSession(cfg.clientId, rpsid);
  if (!session) return null;

  const now = Math.floor(Date.now() / 1000);
  if (session.accessExpiresAt - now <= REFRESH_SKEW_SECONDS && session.refreshToken) {
    session = await tryRefresh(cfg, rpsid, session);
    if (!session) return null; // refresh failed -> session invalid
  }

  let claims: AccessClaims;
  try {
    claims = (await verifyToken(session.accessToken, cfg)) as AccessClaims;
  } catch {
    return null;
  }
  return { user: toAuthUser(claims), accessToken: session.accessToken };
}

async function tryRefresh(
  cfg: OidcConfig,
  rpsid: string,
  session: RpSession,
): Promise<RpSession | null> {
  try {
    const tokens = await refreshTokens(cfg, session.refreshToken!);
    const next: RpSession = {
      ...session,
      accessToken: tokens.access_token,
      idToken: tokens.id_token ?? session.idToken,
      // rotation: the IdP returns a fresh refresh token; store it, drop the old
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      accessExpiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 300),
    };
    await putSession(cfg.clientId, rpsid, next, cfg.sessionTtlSeconds);
    return next;
  } catch {
    // invalid_grant (expired/revoked/replayed) -> session is dead
    return null;
  }
}

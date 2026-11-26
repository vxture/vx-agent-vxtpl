import type { OidcConfig } from "./config";
import { errors } from "jose";
import { setTimeout as delay } from "node:timers/promises";
import { verifyToken, refreshTokens, TokenEndpointError } from "./oidc";
import { acquireRefresh, deleteSession, getSession, releaseRefresh, rotateSession, type RpSession } from "./session-store";
import { randomToken } from "./pkce";
import { workspaceScopeKey } from "./workspace-scope";

/** The store and IdP calls freshSession needs; injectable so the race is testable without Redis. */
export interface SessionDeps {
  getSession: typeof getSession;
  rotateSession: typeof rotateSession;
  acquireRefresh: typeof acquireRefresh;
  releaseRefresh: typeof releaseRefresh;
  deleteSession: typeof deleteSession;
  refreshTokens: typeof refreshTokens;
}

const defaultDeps: SessionDeps = { getSession, rotateSession, acquireRefresh, releaseRefresh, deleteSession, refreshTokens };
import { profileFromClaims, toAuthUser, type AccessClaims, type AuthUser, type IdProfile } from "./claims";

// Per-request auth (080-rp section 2.6 / 2.9): rpsid -> session -> silent refresh
// if the access token is near expiry (token rotation: new refresh stored, old
// invalidated) -> verify access token -> AuthUser. Returns null when there is no
// valid session (caller 401s XHR / 302s a page to /auth/login).

const REFRESH_SKEW_SECONDS = 60;
const REFRESH_LEASE_MS = 16_000;
const REFRESH_WAIT_MS = 6500;
const INVALID_ACCESS_TOKEN = new Set([
  "ERR_JWT_EXPIRED",
  "ERR_JWT_INVALID",
  "ERR_JWT_CLAIM_VALIDATION_FAILED",
  "ERR_JWS_INVALID",
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JOSE_ALG_NOT_ALLOWED",
]);

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
): Promise<{ user: AuthUser; accessToken: string; idToken: string; profile: IdProfile; scopeKey: string | null } | null> {
  const session = await freshSession(cfg, rpsid);
  if (!session) return null;

  let verified;
  try {
    verified = await verifyToken(session.accessToken, cfg);
  } catch (error) {
    if (error instanceof errors.JOSEError && INVALID_ACCESS_TOKEN.has(error.code)) return null;
    throw error;
  }
  if (typeof verified.sub !== "string" || verified.sub !== session.sub) return null;
  // Bind the browser scope to the verified ID claims at the token boundary.
  const workspace = verified.active_workspace;
  const organization = typeof verified.active_org === "string" ? verified.active_org : null;
  const scopeKey = typeof workspace === "string" && workspace
    ? workspaceScopeKey(cfg, verified.sub, organization, workspace)
    : null;
  return {
    user: toAuthUser(verified as AccessClaims),
    accessToken: session.accessToken,
    idToken: session.idToken,
    profile: profileFromClaims(verified),
    scopeKey,
  };
}

/** The stored session, refreshed first if its access token is near expiry. */
export async function freshSession(
  cfg: OidcConfig,
  rpsid: string,
  deps: SessionDeps = defaultDeps,
): Promise<RpSession | null> {
  const session = await deps.getSession(cfg.clientId, rpsid);
  if (!session) return null;
  if (!nearExpiry(session)) return session;
  return refreshOnce(cfg, rpsid, deps);
}

function nearExpiry(session: RpSession): boolean {
  const now = Math.floor(Date.now() / 1000);
  return session.accessExpiresAt - now <= REFRESH_SKEW_SECONDS && !!session.refreshToken;
}

// SINGLE-FLIGHT. The IdP rotates refresh tokens: each one works exactly once.
// Several requests resolve the same session at once (parallel client fetches,
// route handlers, server actions), and after the access token expires every one
// of them read the same stale session. Each presented the same refresh token;
// the first won and the rest got invalid_grant as a replay and returned null -
// a signed-in member saw a 401 or the sign-in prompt. Concurrent callers for one
// rpsid in this process now share one refresh (mirrored from vx-agent-yucer#517).
const inflight = new Map<string, Promise<RpSession | null>>();

function refreshOnce(
  cfg: OidcConfig,
  rpsid: string,
  deps: SessionDeps,
): Promise<RpSession | null> {
  const key = `${cfg.clientId}:${rpsid}`;
  let pending = inflight.get(key);
  if (!pending) {
    pending = refreshUnderLease(cfg, rpsid, deps).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

/* Redis arbitrates cross-process refreshes. Waiters never present the same token. */
async function refreshUnderLease(cfg: OidcConfig, rpsid: string, deps: SessionDeps): Promise<RpSession | null> {
  const owner = randomToken(16);
  const deadline = Date.now() + REFRESH_WAIT_MS;
  let wait = 70;
  do {
    const current = await deps.getSession(cfg.clientId, rpsid);
    if (!current || !nearExpiry(current)) return current;
    if (await deps.acquireRefresh(cfg.clientId, rpsid, owner, REFRESH_LEASE_MS)) {
      try {
        const latest = await deps.getSession(cfg.clientId, rpsid);
        if (!latest || !nearExpiry(latest)) return latest;
        return await tryRefresh(cfg, rpsid, latest, deps);
      } finally {
        await deps.releaseRefresh(cfg.clientId, rpsid, owner).catch(() => undefined);
      }
    }
    await delay(wait);
    wait = Math.min(wait * 2, 450);
  } while (Date.now() < deadline);
  throw new Error("Session refresh is still in progress");
}

async function tryRefresh(
  cfg: OidcConfig,
  rpsid: string,
  session: RpSession,
  deps: SessionDeps,
): Promise<RpSession | null> {
  try {
    const tokens = await deps.refreshTokens(cfg, session.refreshToken!);
    const next: RpSession = {
      ...session,
      accessToken: tokens.access_token,
      idToken: tokens.id_token ?? session.idToken,
      // rotation: the IdP returns a fresh refresh token; store it, drop the old
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      accessExpiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 300),
    };
    if (await deps.rotateSession(cfg.clientId, rpsid, session, next, cfg.sessionTtlSeconds)) return next;
    return deps.getSession(cfg.clientId, rpsid);
  } catch (error) {
    // Another process may have rotated this token between our read and our
    // refresh (single-flight is per process). If the store now holds a
    // different, fresh session, that one is valid - use it.
    const current = await deps.getSession(cfg.clientId, rpsid);
    if (!current) return null;
    if (current && current.refreshToken !== session.refreshToken && !nearExpiry(current)) {
      return current;
    }
    if (error instanceof TokenEndpointError && error.status === 400 && error.oauthError === "invalid_grant") {
      await deps.deleteSession(cfg.clientId, rpsid, session.refreshToken);
      return null;
    }
    throw error;
  }
}

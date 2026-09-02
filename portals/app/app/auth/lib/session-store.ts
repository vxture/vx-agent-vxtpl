import Redis from "ioredis";
import type { IdProfile } from "./claims";

// RP session store on Redis (080-rp section 2.4). Key families are namespaced by
// client_id so multiple RPs can share one Redis:
//   vx:rp:{cid}:authstate:{state}  login handshake {verifier,nonce,returnTo}, ~600s, single-use
//   vx:rp:{cid}:sess:{rpsid}       session bundle {tokens,sid,sub,...}, TTL ~ refresh lifetime
//   vx:rp:{cid}:profile:{rpsid}    display profile {name,picture,email}, short TTL
//   vx:rp:{cid}:sididx:{sid}       SET of rpsids for a given IdP sid (back-channel logout)
//   vx:rp:{cid}:bclogout:{jti}     logout_token replay guard
//
// Fail-closed: if Redis is unreachable, session reads throw and the request is
// treated as unauthenticated (ADR-001 refresh fail-closed).

let client: Redis | null = null;

function redis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
  }
  return client;
}

const k = {
  authstate: (cid: string, state: string) => `vx:rp:${cid}:authstate:${state}`,
  sess: (cid: string, rpsid: string) => `vx:rp:${cid}:sess:${rpsid}`,
  profile: (cid: string, rpsid: string) => `vx:rp:${cid}:profile:${rpsid}`,
  sididx: (cid: string, sid: string) => `vx:rp:${cid}:sididx:${sid}`,
  bclogout: (cid: string, jti: string) => `vx:rp:${cid}:bclogout:${jti}`,
};

export interface AuthState {
  verifier: string;
  nonce: string;
  returnTo: string;
  /** This handshake was a `prompt=none` attempt, so the callback treats an
   * `login_required` answer as "no session there", not as a failure. */
  silent?: boolean;
}

export interface RpSession {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  accessExpiresAt: number; // epoch seconds
  sid?: string; // IdP session id (for back-channel logout)
  sub: string;
}

export async function putAuthState(
  cid: string,
  state: string,
  data: AuthState,
  ttlSeconds = 600,
): Promise<void> {
  await redis().set(k.authstate(cid, state), JSON.stringify(data), "EX", ttlSeconds);
}

/** Single-use: get and delete atomically (defeats state replay). */
export async function takeAuthState(cid: string, state: string): Promise<AuthState | null> {
  const raw = await redis().getdel(k.authstate(cid, state));
  return raw ? (JSON.parse(raw) as AuthState) : null;
}

export async function putSession(
  cid: string,
  rpsid: string,
  data: RpSession,
  ttlSeconds: number,
): Promise<void> {
  const r = redis();
  const tx = r.multi();
  tx.set(k.sess(cid, rpsid), JSON.stringify(data), "EX", ttlSeconds);
  if (data.sid) {
    tx.sadd(k.sididx(cid, data.sid), rpsid);
    tx.expire(k.sididx(cid, data.sid), ttlSeconds);
  }
  await tx.exec();
}

export async function getSession(cid: string, rpsid: string): Promise<RpSession | null> {
  const raw = await redis().get(k.sess(cid, rpsid));
  return raw ? (JSON.parse(raw) as RpSession) : null;
}

export async function deleteSession(cid: string, rpsid: string): Promise<void> {
  const r = redis();
  const raw = await r.get(k.sess(cid, rpsid));
  if (raw) {
    const sess = JSON.parse(raw) as RpSession;
    if (sess.sid) await r.srem(k.sididx(cid, sess.sid), rpsid);
  }
  await r.del(k.sess(cid, rpsid), k.profile(cid, rpsid));
}

// --- display profile cache -------------------------------------------------
//
// Kept in its OWN key rather than inside the session bundle on purpose: the
// bundle holds the rotating refresh token, and a read-modify-write from the
// display path could race a silent refresh and persist a retired token, which
// would kill the session. A separate key makes the cache incapable of that.
//
// The TTL is short (not the session's ~30 days) so a renamed or re-avatared
// account catches up on its own; a null-valued profile is cached too, so an
// account the IdP has no name for costs one UserInfo call per window, not one
// per page load.

export async function putProfile(
  cid: string,
  rpsid: string,
  profile: IdProfile,
  ttlSeconds: number,
): Promise<void> {
  await redis().set(k.profile(cid, rpsid), JSON.stringify(profile), "EX", ttlSeconds);
}

export async function getProfile(cid: string, rpsid: string): Promise<IdProfile | null> {
  const raw = await redis().get(k.profile(cid, rpsid));
  return raw ? (JSON.parse(raw) as IdProfile) : null;
}

export async function sessionsForSid(cid: string, sid: string): Promise<string[]> {
  return redis().smembers(k.sididx(cid, sid));
}

/** Back-channel logout replay guard: returns true only the first time for a jti. */
export async function claimBclogoutJti(cid: string, jti: string, ttlSeconds = 300): Promise<boolean> {
  const res = await redis().set(k.bclogout(cid, jti), "1", "EX", ttlSeconds, "NX");
  return res === "OK";
}

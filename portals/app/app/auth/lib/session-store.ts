import Redis from "ioredis";

// RP session store on Redis (080-rp section 2.4). Key families are namespaced by
// client_id so multiple RPs can share one Redis:
//   vx:rp:{cid}:authstate:{state}  login handshake {verifier,nonce,returnTo}, ~600s, single-use
//   vx:rp:{cid}:sess:{rpsid}       session bundle {tokens,sid,sub,...}, TTL ~ refresh lifetime
//   vx:rp:{cid}:profile:{rpsid}    legacy display cache, cleared on revocation
//   vx:rp:{cid}:sididx:{sid}       SET of rpsids for a given IdP sid (back-channel logout)
//   vx:rp:{cid}:revoked:{sid}      short barrier against a late OIDC callback
//
// Session reads throw when storage is unavailable so callers can report a
// temporary error without treating the browser as signed out.

let client: Redis | null = null;

export function rpRedis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 2,
      commandTimeout: 3500,
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
  revoked: (cid: string, sid: string) => `vx:rp:${cid}:revoked:${sid}`,
  mutex: (cid: string, rpsid: string) => `vx:rp:${cid}:refresh:${rpsid}`,
};

export const sessionEventChannel = (cid: string) => `vx:rp:${cid}:session-events`;
export const AUTH_STATE_TTL = 600;

export interface AuthState {
  verifier: string;
  nonce: string;
  returnTo: string;
  browserBinding: string;
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
  ttlSeconds = AUTH_STATE_TTL,
): Promise<void> {
  await rpRedis().set(k.authstate(cid, state), JSON.stringify(data), "EX", ttlSeconds);
}

/** Consume once, only from the browser which initiated authorization. */
export async function takeAuthState(cid: string, state: string, binding: string): Promise<AuthState | null> {
  const raw = await rpRedis().eval(`
    local value = redis.call('GET', KEYS[1])
    if not value or cjson.decode(value).browserBinding ~= ARGV[1] then return false end
    redis.call('DEL', KEYS[1])
    return value
  `, 1, k.authstate(cid, state), binding);
  return typeof raw === "string" ? JSON.parse(raw) as AuthState : null;
}

export async function putSession(
  cid: string,
  rpsid: string,
  data: RpSession,
  ttlSeconds: number,
): Promise<boolean> {
  const result = await rpRedis().eval(`
    if ARGV[4] == '1' and redis.call('EXISTS', KEYS[3]) == 1 then return 0 end
    redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
    if ARGV[4] == '1' then
      redis.call('SADD', KEYS[2], ARGV[3])
      redis.call('EXPIRE', KEYS[2], ARGV[2])
    end
    return 1
  `, 3, k.sess(cid, rpsid), k.sididx(cid, data.sid ?? ""), k.revoked(cid, data.sid ?? ""),
  JSON.stringify(data), ttlSeconds, rpsid, data.sid ? "1" : "0");
  return result === 1;
}

export async function getSession(cid: string, rpsid: string): Promise<RpSession | null> {
  const raw = await rpRedis().get(k.sess(cid, rpsid));
  return raw ? (JSON.parse(raw) as RpSession) : null;
}

export async function deleteSession(cid: string, rpsid: string, expectedRefresh?: string): Promise<void> {
  await rpRedis().eval(`
    local raw = redis.call('GET', KEYS[1])
    if not raw then return 0 end
    local session = cjson.decode(raw)
    if ARGV[3] == '1' and session.refreshToken ~= ARGV[4] then return 0 end
    if session.sid then redis.call('SREM', ARGV[1] .. session.sid, ARGV[2]) end
    redis.call('DEL', KEYS[1], KEYS[2])
    redis.call('PUBLISH', KEYS[3], ARGV[2])
    return 1
  `, 3, k.sess(cid, rpsid), k.profile(cid, rpsid), sessionEventChannel(cid),
  k.sididx(cid, ""), rpsid, expectedRefresh ? "1" : "0", expectedRefresh ?? "");
}

/** The verified logout applies to one IdP sid. A repeat delivery is idempotent. */
export async function revokeSessionsForSid(cid: string, sid: string): Promise<void> {
  await rpRedis().eval(`
    local sessions = redis.call('SMEMBERS', KEYS[1])
    for _, rpsid in ipairs(sessions) do
      local raw = redis.call('GET', ARGV[1] .. rpsid)
      if raw and cjson.decode(raw).sid == ARGV[4] then
        redis.call('DEL', ARGV[1] .. rpsid, ARGV[2] .. rpsid)
        redis.call('PUBLISH', KEYS[3], rpsid)
      end
    end
    redis.call('SET', KEYS[2], '1', 'EX', ARGV[3])
    redis.call('DEL', KEYS[1])
    return #sessions
  `, 3, k.sididx(cid, sid), k.revoked(cid, sid), sessionEventChannel(cid),
  k.sess(cid, ""), k.profile(cid, ""), AUTH_STATE_TTL * 2, sid);
}

/** Commit only over the exact live token which was rotated. */
export async function rotateSession(cid: string, rpsid: string, previous: RpSession, next: RpSession, ttlSeconds: number): Promise<boolean> {
  const result = await rpRedis().eval(`
    local raw = redis.call('GET', KEYS[1])
    if not raw or cjson.decode(raw).refreshToken ~= ARGV[1] then return 0 end
    redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
    if ARGV[5] == '1' then
      redis.call('SADD', KEYS[2], ARGV[4])
      redis.call('EXPIRE', KEYS[2], ARGV[3])
    end
    return 1
  `, 2, k.sess(cid, rpsid), k.sididx(cid, next.sid ?? ""),
  previous.refreshToken ?? "", JSON.stringify(next), ttlSeconds, rpsid, next.sid ? "1" : "0");
  return result === 1;
}

export async function acquireRefresh(cid: string, rpsid: string, owner: string, ttlMs: number): Promise<boolean> {
  return await rpRedis().set(k.mutex(cid, rpsid), owner, "PX", ttlMs, "NX") === "OK";
}

export async function releaseRefresh(cid: string, rpsid: string, owner: string): Promise<void> {
  await rpRedis().eval(`
    if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
    return 0
  `, 1, k.mutex(cid, rpsid), owner);
}

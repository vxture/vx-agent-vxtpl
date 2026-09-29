import { test } from "node:test";
import assert from "node:assert/strict";
import { freshSession, type SessionDeps } from "./session";
import type { RpSession } from "./session-store";
import type { OidcConfig } from "./config";
import type { TokenSet } from "./oidc";

// The refresh half of getAuthContext, against an IdP that ROTATES refresh
// tokens the way the platform does: every refresh token works exactly once, and
// presenting a spent one is invalid_grant.
//
// The defect this pins: several requests resolve the same session at once
// (parallel client fetches, route handlers, server actions - none of them share
// a result). After the access token expires, each of them saw the same stale
// session and presented the same refresh token. The first won; the rest were
// rejected as a replay and returned null, so a signed-in member got a 401 or
// the sign-in prompt. /api/access resolved it once to dodge this for the front
// door; every other caller still raced. Mirrored from vx-agent-yucer#517, where
// it surfaced as "idle about 10 minutes, then the page stops working, and
// sign-in goes straight back in".

const cfg = { clientId: "vxtpl" } as OidcConfig;
const now = () => Math.floor(Date.now() / 1000);

function rotatingIdp(opts: { latencyMs?: number } = {}) {
  let live = "rt-0";
  let issued = 0;
  const calls: string[] = [];
  const refresh = async (_cfg: OidcConfig, rt: string): Promise<TokenSet> => {
    calls.push(rt);
    await new Promise((r) => setTimeout(r, opts.latencyMs ?? 20));
    if (rt !== live) throw new Error("token endpoint 400: invalid_grant");
    issued += 1;
    live = `rt-${issued}`;
    return { access_token: `at-${issued}`, refresh_token: live, token_type: "Bearer", expires_in: 300 };
  };
  return { refresh, calls, live: () => live };
}

function memoryStore(initial: RpSession) {
  const map = new Map<string, RpSession>([["vxtpl:rpsid-1", initial]]);
  return {
    getSession: async (cid: string, rpsid: string) => map.get(`${cid}:${rpsid}`) ?? null,
    putSession: async (cid: string, rpsid: string, data: RpSession) => {
      map.set(`${cid}:${rpsid}`, data);
    },
    peek: () => map.get("vxtpl:rpsid-1")!,
  };
}

function expired(): RpSession {
  return { idToken: "id", accessToken: "at-0", refreshToken: "rt-0", accessExpiresAt: now() - 5, sub: "u1" };
}

function deps(store: ReturnType<typeof memoryStore>, idp: ReturnType<typeof rotatingIdp>): SessionDeps {
  return { getSession: store.getSession, putSession: store.putSession, refreshTokens: idp.refresh };
}

test("concurrent resolutions of an expired session refresh ONCE and all succeed", async () => {
  const store = memoryStore(expired());
  const idp = rotatingIdp();
  const d = deps(store, idp);

  const results = await Promise.all([1, 2, 3, 4].map(() => freshSession(cfg, "rpsid-1", d)));

  assert.deepEqual(idp.calls, ["rt-0"], "exactly one refresh reaches the IdP");
  for (const r of results) assert.equal(r?.accessToken, "at-1");
  assert.equal(store.peek().refreshToken, "rt-1", "the rotated token is what is stored");
});

test("a request that lost the race to another process reads the rotated session instead of failing", async () => {
  const store = memoryStore(expired());
  const idp = rotatingIdp();
  // Another replica already rotated rt-0 -> rt-1 and stored it; this process
  // still holds the stale copy it read before that write landed.
  const stale = expired();
  await idp.refresh(cfg, "rt-0");
  await store.putSession("vxtpl", "rpsid-1", {
    ...stale, accessToken: "at-1", refreshToken: "rt-1", accessExpiresAt: now() + 300,
  });
  const d: SessionDeps = {
    ...deps(store, idp),
    // First read returns the stale copy, later reads the stored truth.
    getSession: (() => {
      let first = true;
      return async (cid: string, rpsid: string) => {
        if (first) { first = false; return stale; }
        return store.getSession(cid, rpsid);
      };
    })(),
  };

  const r = await freshSession(cfg, "rpsid-1", d);
  assert.equal(r?.accessToken, "at-1");
});

test("a refresh the IdP genuinely rejects still ends the session", async () => {
  const store = memoryStore({ ...expired(), refreshToken: "rt-revoked" });
  const idp = rotatingIdp();
  const r = await freshSession(cfg, "rpsid-1", deps(store, idp));
  assert.equal(r, null);
});

test("a session that is not near expiry is returned without a refresh", async () => {
  const store = memoryStore({ ...expired(), accessExpiresAt: now() + 600 });
  const idp = rotatingIdp();
  const r = await freshSession(cfg, "rpsid-1", deps(store, idp));
  assert.equal(r?.accessToken, "at-0");
  assert.deepEqual(idp.calls, []);
});

test("the single-flight slot is released, so the next expiry refreshes again", async () => {
  const store = memoryStore(expired());
  const idp = rotatingIdp({ latencyMs: 1 });
  const d = deps(store, idp);
  await freshSession(cfg, "rpsid-1", d);
  await store.putSession("vxtpl", "rpsid-1", { ...store.peek(), accessExpiresAt: now() - 5 });
  const r = await freshSession(cfg, "rpsid-1", d);
  assert.equal(r?.accessToken, "at-2");
  assert.deepEqual(idp.calls, ["rt-0", "rt-1"]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT, exportJWK } from "jose";
import { fetchUserInfo, verifyToken } from "./oidc";
import type { OidcConfig } from "./config";

const ISSUER = "https://accounts.vxture.com";
const CLIENT = "testclient";

function testConfig(): OidcConfig {
  return {
    issuer: ISSUER,
    clientId: CLIENT,
    clientSecret: "s",
    redirectUri: "https://app.example/auth/callback",
    postLogoutRedirectUri: "",
    scopes: "openid",
    enabled: true,
    sessionTtlSeconds: 3600,
    cookieName: "vx_rp_session",
    appOrigin: "https://app.example",
    authorizeUrl: `${ISSUER}/oidc/authorize`,
    tokenUrl: `${ISSUER}/oidc/token`,
    jwksUrl: `${ISSUER}/oidc/jwks`,
    userInfoUrl: `${ISSUER}/oidc/userinfo`,
    endSessionUrl: `${ISSUER}/oidc/end_session`,
  };
}

async function keys() {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  return { publicKey, privateKey };
}

test("accepts a valid RS256 token with correct iss/aud", async () => {
  const cfg = testConfig();
  const { publicKey, privateKey } = await keys();
  const token = await new SignJWT({ sub: "usr_1", roles: ["workspace:owner"] })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(ISSUER)
    .setAudience(CLIENT)
    .setExpirationTime("5m")
    .sign(privateKey);
  const payload = await verifyToken(token, cfg, { keyResolver: publicKey });
  assert.equal(payload.sub, "usr_1");
});

test("rejects HS256 (alg downgrade) - RS256 is the only allowed alg", async () => {
  const cfg = testConfig();
  const { publicKey } = await keys();
  const secret = new TextEncoder().encode("a-shared-secret-value-000000000000");
  const hs = await new SignJWT({ sub: "usr_1" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(CLIENT)
    .setExpirationTime("5m")
    .sign(secret);
  await assert.rejects(() => verifyToken(hs, cfg, { keyResolver: publicKey }));
});

test("rejects wrong audience", async () => {
  const cfg = testConfig();
  const { publicKey, privateKey } = await keys();
  const token = await new SignJWT({ sub: "usr_1" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(ISSUER)
    .setAudience("someone-else")
    .setExpirationTime("5m")
    .sign(privateKey);
  await assert.rejects(() => verifyToken(token, cfg, { keyResolver: publicKey }));
});

test("rejects wrong issuer", async () => {
  const cfg = testConfig();
  const { publicKey, privateKey } = await keys();
  const token = await new SignJWT({ sub: "usr_1" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer("https://evil.example")
    .setAudience(CLIENT)
    .setExpirationTime("5m")
    .sign(privateKey);
  await assert.rejects(() => verifyToken(token, cfg, { keyResolver: publicKey }));
});

test("rejects an expired token beyond the 60s skew", async () => {
  const cfg = testConfig();
  const { publicKey, privateKey } = await keys();
  const token = await new SignJWT({ sub: "usr_1" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(ISSUER)
    .setAudience(CLIENT)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(privateKey);
  await assert.rejects(() => verifyToken(token, cfg, { keyResolver: publicKey }));
});

test("exportJWK is available (sanity that jose keypair is usable)", async () => {
  const { publicKey } = await keys();
  const jwk = await exportJWK(publicKey);
  assert.equal(jwk.kty, "RSA");
});

// --- UserInfo -------------------------------------------------------------

async function withStubbedFetch<T>(
  handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
  body: () => Promise<T>,
): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init))) as typeof fetch;
  try {
    return await body();
  } finally {
    globalThis.fetch = real;
  }
}

test("fetchUserInfo presents the access token and returns the claims", async () => {
  const cfg = testConfig();
  let seen = "";
  const info = await withStubbedFetch(
    (url, init) => {
      assert.equal(url, `${ISSUER}/oidc/userinfo`);
      seen = String((init?.headers as Record<string, string>).authorization);
      return Response.json({ sub: "usr_1", name: "Ada L", email: "ada@x.com" });
    },
    () => fetchUserInfo(cfg, "at_123", "usr_1"),
  );
  assert.equal(seen, "Bearer at_123");
  assert.equal(info?.name, "Ada L");
});

// A body for someone else is not this person's profile. Rendering it would put
// one account's name and avatar on another's session, so it is dropped.
test("fetchUserInfo drops a body whose sub is not the caller's", async () => {
  const cfg = testConfig();
  const info = await withStubbedFetch(
    () => Response.json({ sub: "usr_someone_else", name: "Mallory" }),
    () => fetchUserInfo(cfg, "at_123", "usr_1"),
  );
  assert.equal(info, null);
});

test("fetchUserInfo degrades to null, never throws", async () => {
  const cfg = testConfig();
  assert.equal(
    await withStubbedFetch(
      () => new Response("nope", { status: 401 }),
      () => fetchUserInfo(cfg, "at_123", "usr_1"),
    ),
    null,
  );
  assert.equal(
    await withStubbedFetch(
      () => new Response("not json", { status: 200 }),
      () => fetchUserInfo(cfg, "at_123", "usr_1"),
    ),
    null,
  );
  assert.equal(
    await withStubbedFetch(
      () => {
        throw new Error("network down");
      },
      () => fetchUserInfo(cfg, "at_123", "usr_1"),
    ),
    null,
  );
});

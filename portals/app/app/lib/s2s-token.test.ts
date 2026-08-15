import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  PLATFORM_AUDIENCE,
  cacheKeysForTest,
  getS2SConfig,
  invalidateS2SToken,
  mintS2SToken,
  resetS2STokenCache,
  S2STokenError,
} from "./s2s-token";

const ENV_KEYS = ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET"] as const;
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

function configure(): void {
  process.env.OIDC_ISSUER = "http://accounts.internal";
  process.env.OIDC_CLIENT_ID = "vxtpl";
  process.env.OIDC_CLIENT_SECRET = "s3cret";
}

/** Records every request so a test can assert on the exact form the platform receives. */
function stubToken(
  response: { status?: number; body?: unknown; text?: string } = {},
): { calls: { url: string; form: URLSearchParams }[] } {
  const calls: { url: string; form: URLSearchParams }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), form: new URLSearchParams(String(init?.body ?? "")) });
    const status = response.status ?? 200;
    const payload = response.text ?? JSON.stringify(response.body ?? { access_token: "tok", expires_in: 300 });
    return new Response(payload, { status, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  return { calls };
}

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  resetS2STokenCache();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  globalThis.fetch = realFetch;
  resetS2STokenCache();
});

test("config needs all three OIDC values", () => {
  configure();
  assert.ok(getS2SConfig());
  delete process.env.OIDC_CLIENT_SECRET;
  assert.equal(getS2SConfig(), null);
});

test("service mode posts the RFC 8693 form the platform token endpoint expects", async () => {
  configure();
  const { calls } = stubToken();
  const token = await mintS2SToken("atlas", { workspaceId: "ws-1" });
  assert.equal(token, "tok");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://accounts.internal/oidc/token");
  const f = calls[0].form;
  assert.equal(f.get("grant_type"), "urn:ietf:params:oauth:grant-type:token-exchange");
  assert.equal(f.get("client_id"), "vxtpl");
  assert.equal(f.get("client_secret"), "s3cret");
  assert.equal(f.get("audience"), "atlas");
  assert.equal(f.get("workspace_id"), "ws-1");
  assert.equal(f.get("subject_token"), null);
});

test("OBO mode sends subject_token and omits workspace_id", async () => {
  configure();
  const { calls } = stubToken();
  await mintS2SToken("runos", { subjectToken: "user-access-token", workspaceId: "ws-ignored" });
  const f = calls[0].form;
  assert.equal(f.get("subject_token"), "user-access-token");
  assert.equal(f.get("workspace_id"), null, "workspace is read from the subject token, never declared");
});

test("a cached token is reused, and different identities never share one", async () => {
  configure();
  const { calls } = stubToken();
  await mintS2SToken("atlas", { workspaceId: "ws-1" });
  await mintS2SToken("atlas", { workspaceId: "ws-1" });
  assert.equal(calls.length, 1, "second call served from cache");

  await mintS2SToken("atlas", { workspaceId: "ws-2" });
  assert.equal(calls.length, 2, "a different workspace must mint its own token");

  await mintS2SToken("runos", { workspaceId: "ws-1" });
  assert.equal(calls.length, 3, "a different audience must mint its own token");

  await mintS2SToken("atlas", { subjectToken: "user-a" });
  await mintS2SToken("atlas", { subjectToken: "user-b" });
  assert.equal(calls.length, 5, "one user's OBO token must never be handed to another");
});

test("the OBO cache key is derived from the subject token, never equal to it", async () => {
  configure();
  stubToken();
  const secret = "a-real-looking.user.access-token";
  await mintS2SToken("atlas", { subjectToken: secret });
  // The user's token is a credential; it must not sit in a map key where a heap
  // dump or a debug log of the cache would expose it.
  assert.equal(
    JSON.stringify([...cacheKeysForTest()]).includes(secret),
    false,
    "the raw subject token leaked into a cache key",
  );
});

test("a token expiring inside the safety margin is re-minted, not replayed", async () => {
  configure();
  const { calls } = stubToken({ body: { access_token: "tok", expires_in: 20 } });
  await mintS2SToken(PLATFORM_AUDIENCE, { workspaceId: "ws-1" });
  await mintS2SToken(PLATFORM_AUDIENCE, { workspaceId: "ws-1" });
  assert.equal(calls.length, 2, "20s < the 30s margin, so the cache entry is never reused");
});

test("invalidate drops exactly the one identity's entry", async () => {
  configure();
  const { calls } = stubToken();
  await mintS2SToken("atlas", { workspaceId: "ws-1" });
  await mintS2SToken("atlas", { workspaceId: "ws-2" });
  invalidateS2SToken("atlas", { workspaceId: "ws-1" });
  await mintS2SToken("atlas", { workspaceId: "ws-1" });
  await mintS2SToken("atlas", { workspaceId: "ws-2" });
  assert.equal(calls.length, 3);
});

test("the D2 coverage refusal is surfaced as invalid_target, not a generic failure", async () => {
  configure();
  // The token endpoint answers with a NestJS body: the OAuth code is in
  // `message`, while `error` carries only the HTTP reason phrase.
  stubToken({ status: 400, text: JSON.stringify({ message: "invalid_target", error: "Bad Request", statusCode: 400 }) });
  await assert.rejects(
    () => mintS2SToken("atlas", { workspaceId: "ws-uncovered" }),
    (err: unknown) =>
      err instanceof S2STokenError && err.code === "invalid_target" && err.status === 400 && !err.retryable,
  );
});

test("a bad client secret is surfaced as invalid_client and is not retryable", async () => {
  configure();
  stubToken({ status: 401, text: JSON.stringify({ message: "invalid_client", error: "Unauthorized" }) });
  await assert.rejects(
    () => mintS2SToken("atlas", { workspaceId: "ws-1" }),
    (err: unknown) => err instanceof S2STokenError && err.code === "invalid_client" && !err.retryable,
  );
});

test("a missing signing key and a rate limit are retryable; a bad request is not", async () => {
  configure();
  stubToken({ status: 400, text: JSON.stringify({ message: "temporarily_unavailable" }) });
  await assert.rejects(
    () => mintS2SToken("atlas", { workspaceId: "ws-1" }),
    (err: unknown) => err instanceof S2STokenError && err.retryable,
  );

  resetS2STokenCache();
  stubToken({ status: 429, text: "rate limited" });
  await assert.rejects(
    () => mintS2SToken("atlas", { workspaceId: "ws-1" }),
    (err: unknown) => err instanceof S2STokenError && err.retryable && err.code === "exchange_failed",
  );
});

test("minting without any identity is refused before a request is made", async () => {
  configure();
  const { calls } = stubToken();
  await assert.rejects(
    () => mintS2SToken("atlas", {}),
    (err: unknown) => err instanceof S2STokenError && err.code === "invalid_request",
  );
  assert.equal(calls.length, 0);
});

test("minting without OIDC config is refused before a request is made", async () => {
  for (const k of ENV_KEYS) delete process.env[k];
  const { calls } = stubToken();
  await assert.rejects(
    () => mintS2SToken("atlas", { workspaceId: "ws-1" }),
    (err: unknown) => err instanceof S2STokenError && err.code === "not_configured",
  );
  assert.equal(calls.length, 0);
});

test("a token response with no access_token is a failure, not an empty bearer", async () => {
  configure();
  stubToken({ body: { expires_in: 300 } });
  await assert.rejects(
    () => mintS2SToken("atlas", { workspaceId: "ws-1" }),
    (err: unknown) => err instanceof S2STokenError && err.code === "malformed_response",
  );
});

test("the issuer is held to the cleartext-egress guard", async () => {
  configure();
  process.env.OIDC_ISSUER = "http://accounts.example.com"; // public host over http
  stubToken();
  await assert.rejects(() => mintS2SToken("atlas", { workspaceId: "ws-1" }), /refusing cleartext egress/);
});

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AtlasError, fetchChatCompletion, getAtlasClientConfig } from "./atlas-client";
import { resetS2STokenCache } from "../lib/s2s-token";

// These pin the parts of the Atlas contract that fail QUIETLY rather than
// loudly: a non-UUID tenantId that works until a grant lapses and then reports a
// payload error, usage zeros that are not really zero, and an error body shape
// that yields `undefined` for the whole request-validation class.

const ENV = {
  OIDC_ISSUER: "http://accounts.internal",
  OIDC_CLIENT_ID: "vxtpl",
  OIDC_CLIENT_SECRET: "s3cret",
  ATLAS_API_URL: "http://worker-02:3100",
};
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
const IDENTITY = { subjectToken: "user-access-token" };
const MESSAGES = [{ role: "user" as const, content: "hi" }];

const TENANT = "7f1d1a1e-0000-4000-8000-00000000abcd";

/** Minted claims are read from the JWT payload, so the stub must produce a real one. */
function jwtWith(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${payload}.sig`;
}

interface Capture {
  url: string;
  body: Record<string, unknown>;
}

function stub(response: unknown, status = 200, claims: Record<string, unknown> = { tenant_id: TENANT }): Capture[] {
  const calls: Capture[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/oidc/token")) {
      return new Response(JSON.stringify({ access_token: jwtWith(claims), expires_in: 300 }), { status: 200 });
    }
    calls.push({ url, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {} });
    return new Response(JSON.stringify(response), { status, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  return calls;
}

const OK_RESPONSE = {
  id: "req-1",
  modelCode: "doubao-seed-2-0-lite-260428",
  message: { role: "assistant", content: "hello" },
  usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  latencyMs: 900,
  finishReason: "stop",
};

beforeEach(() => {
  for (const k of Object.keys(ENV)) saved[k] = process.env[k];
  Object.assign(process.env, ENV);
  resetS2STokenCache();
});

afterEach(() => {
  for (const k of Object.keys(ENV)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  globalThis.fetch = realFetch;
  resetS2STokenCache();
});

test("config needs only a base URL", () => {
  assert.ok(getAtlasClientConfig());
  delete process.env.ATLAS_API_URL;
  assert.equal(getAtlasClientConfig(), null);
});

test("tenantId is the tenant UUID from the token, never the product code", async () => {
  const calls = stub(OK_RESPONSE);
  await fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, "chat/default");

  assert.equal(calls[0].url, "http://worker-02:3100/v1/chat");
  // Sending "vxtpl" here validates fine and works while a product grant exists,
  // then fails 400 INVALID_TENANT_ID the moment it does not - and writes NULL
  // into the request log in the meantime, so the traffic vanishes from rollups.
  assert.equal(calls[0].body.tenantId, TENANT);
  assert.notEqual(calls[0].body.tenantId, "vxtpl");
  assert.equal(calls[0].body.endpointCode, "chat/default");
  assert.ok(calls[0].body.requestId, "requestId is also the C3 idempotency key");
});

test("org_id stands in when the workspace has no tenant row", async () => {
  const calls = stub(OK_RESPONSE, 200, { tenant_id: null, org_id: "org-abc" });
  await fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES);
  assert.equal(calls[0].body.tenantId, "org-abc");
});

test("with no tenant claim at all the field is omitted, never sent empty", async () => {
  const calls = stub(OK_RESPONSE, 200, { workspace_id: "ws-1" });
  await fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES);
  // An empty string trips "must be a non-empty string", which reads as a client
  // bug; omitting it lets Atlas answer with its real "no tenant anywhere" 400.
  assert.equal("tenantId" in calls[0].body, false);
});

test("the resolved model is reported, not the one requested", async () => {
  stub(OK_RESPONSE);
  const out = await fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, "chat/pro");
  // Endpoint fallback means what served can differ from what was asked for.
  assert.equal(out.modelCode, "doubao-seed-2-0-lite-260428");
  assert.equal(out.message.content, "hello");
  assert.equal(out.latencyMs, 900);
  assert.deepEqual(out.usage, { promptTokens: 10, completionTokens: 20, totalTokens: 30 });
});

test("unreported usage is null, not zero", async () => {
  stub({ ...OK_RESPONSE, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });
  const out = await fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES);
  // Atlas returns zeros when the upstream reported nothing while recording NULL
  // internally; summing those as real counts understates consumption silently.
  assert.equal(out.usage, null);
});

test("a routing error surfaces its Atlas code", async () => {
  stub({ code: "ENDPOINT_NOT_ROUTABLE", message: "no live endpoint named chat/nope" }, 404);
  await assert.rejects(
    () => fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, "chat/nope"),
    (err: unknown) => err instanceof AtlasError && err.envelope.code === "ENDPOINT_NOT_ROUTABLE" && !err.retryable,
  );
});

test("a Nest validation body still yields a code instead of undefined", async () => {
  // This shape carries no `code` field at all, and it is the first one a new
  // integration hits.
  stub({ statusCode: 400, message: ["tenantId must be a string"], error: "Bad Request" }, 400);
  await assert.rejects(
    () => fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES),
    (err: unknown) =>
      err instanceof AtlasError && err.envelope.code === "VALIDATION_BAD_REQUEST" && /tenantId/.test(err.envelope.message),
  );
});

test("429 and 5xx are retryable; a 4xx routing error is not", async () => {
  stub({ code: "RATE_LIMITED", message: "slow down" }, 429);
  await assert.rejects(
    () => fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES),
    (err: unknown) => err instanceof AtlasError && err.retryable,
  );

  resetS2STokenCache();
  stub({ code: "UPSTREAM_ERROR", message: "provider down" }, 503);
  await assert.rejects(
    () => fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES),
    (err: unknown) => err instanceof AtlasError && err.retryable,
  );
});

test("a 401 re-mints once and retries rather than replaying a stale token", async () => {
  let atlasCalls = 0;
  let mints = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).endsWith("/oidc/token")) {
      mints += 1;
      return new Response(JSON.stringify({ access_token: jwtWith({ tenant_id: TENANT }), expires_in: 300 }), {
        status: 200,
      });
    }
    atlasCalls += 1;
    if (atlasCalls === 1) return new Response(JSON.stringify({ code: "S2S_TOKEN_INVALID", message: "nope" }), { status: 401 });
    return new Response(JSON.stringify(OK_RESPONSE), { status: 200 });
  }) as typeof globalThis.fetch;

  const out = await fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES);
  assert.equal(out.message.content, "hello");
  assert.equal(atlasCalls, 2, "one retry, not more");
  assert.equal(mints, 2, "the cached token was dropped and re-minted");
});

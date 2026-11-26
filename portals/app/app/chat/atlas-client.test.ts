import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AtlasError, fetchChatCompletion, getAtlasClientConfig, listGrantedEndpoints } from "./atlas-client";
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
const TASK_ID = "vxtpl-task-under-test";
const CALL_OPTIONS = { taskId: TASK_ID, endpointCode: "test/dialogue-route" };

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

test("an invalid Atlas route response is distinct from an empty grant directory", async () => {
  const cfg = getAtlasClientConfig()!;
  stub({ modelRoutes: [] });
  await assert.rejects(
    () => listGrantedEndpoints(cfg, IDENTITY),
    (error: unknown) => error instanceof AtlasError && error.envelope.code === "INVALID_MODEL_CATALOG",
  );
  stub({ endpoints: [] });
  assert.deepEqual(await listGrantedEndpoints(cfg, IDENTITY), []);
});

test("tenantId is the tenant UUID from the token, never the product code", async () => {
  const calls = stub(OK_RESPONSE);
  await fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, { taskId: TASK_ID, endpointCode: "chat/default" });

  assert.equal(calls[0].url, "http://worker-02:3100/v1/chat");
  // Sending "vxtpl" here validates fine and works while a product grant exists,
  // then fails 400 INVALID_TENANT_ID the moment it does not - and writes NULL
  // into the request log in the meantime, so the traffic vanishes from rollups.
  assert.equal(calls[0].body.tenantId, TENANT);
  assert.notEqual(calls[0].body.tenantId, "vxtpl");
  assert.equal(calls[0].body.endpointCode, "chat/default");
  assert.equal("modelCode" in calls[0].body, false);
  assert.ok(calls[0].body.requestId, "requestId is also the C3 idempotency key");
  // Required since Atlas v0.15.0 - a call without it is 400 TASK_ID_REQUIRED,
  // and it is what lets a turn that also called Runos be totalled as one task.
  assert.equal(calls[0].body.taskId, TASK_ID);
});

test("model-targeted inference sends modelCode alone and keeps the Atlas attribution contract", async () => {
  const calls = stub(OK_RESPONSE);
  const selectedModel = "requested-model";
  const reply = await fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, {
    taskId: TASK_ID, modelCode: selectedModel,
  });
  assert.equal(calls[0].url, "http://worker-02:3100/v1/chat");
  assert.deepEqual(calls[0].body, {
    modelCode: selectedModel, messages: MESSAGES, tenantId: TENANT,
    taskId: TASK_ID, requestId: calls[0].body.requestId,
  });
  assert.equal(typeof calls[0].body.requestId, "string");
  assert.equal(reply.modelCode, OK_RESPONSE.modelCode);
});

test("org_id stands in when the workspace has no tenant row", async () => {
  const calls = stub(OK_RESPONSE, 200, { tenant_id: null, org_id: "org-abc" });
  await fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, CALL_OPTIONS);
  assert.equal(calls[0].body.tenantId, "org-abc");
});

test("with no tenant claim at all the field is omitted, never sent empty", async () => {
  const calls = stub(OK_RESPONSE, 200, { workspace_id: "ws-1" });
  await fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, CALL_OPTIONS);
  // An empty string trips "must be a non-empty string", which reads as a client
  // bug; omitting it lets Atlas answer with its real "no tenant anywhere" 400.
  assert.equal("tenantId" in calls[0].body, false);
});

test("the resolved model is reported, not the one requested", async () => {
  stub(OK_RESPONSE);
  const out = await fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, { taskId: TASK_ID, endpointCode: "chat/pro" });
  // Endpoint fallback means what served can differ from what was asked for.
  assert.equal(out.modelCode, "doubao-seed-2-0-lite-260428");
  assert.equal(out.message.content, "hello");
  assert.equal(out.latencyMs, 900);
  assert.deepEqual(out.usage, { promptTokens: 10, completionTokens: 20, totalTokens: 30 });
});

test("unreported usage is null, not zero", async () => {
  stub({ ...OK_RESPONSE, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });
  const out = await fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, CALL_OPTIONS);
  // Atlas returns zeros when the upstream reported nothing while recording NULL
  // internally; summing those as real counts understates consumption silently.
  assert.equal(out.usage, null);
});

test("a successful Atlas status with blank content rejects the turn", async () => {
  stub({ ...OK_RESPONSE, message: { role: "assistant", content: "  " } });
  await assert.rejects(
    () => fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, CALL_OPTIONS),
    (error: unknown) => error instanceof AtlasError && error.envelope.code === "EMPTY_MODEL_REPLY",
  );
});

test("a routing error surfaces its Atlas code", async () => {
  stub({ code: "ENDPOINT_NOT_ROUTABLE", message: "no live endpoint named chat/nope" }, 404);
  await assert.rejects(
    () => fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, { taskId: TASK_ID, endpointCode: "chat/nope" }),
    (err: unknown) => err instanceof AtlasError && err.envelope.code === "ENDPOINT_NOT_ROUTABLE" && !err.retryable,
  );
});

test("a request-validation error carries a real code, and a bodiless one degrades", async () => {
  // Atlas answers every /v1 error with a `code` now, request validation
  // included - the bare Nest `{statusCode, message, error}` shape is gone.
  stub({ code: "TASK_ID_REQUIRED", message: "taskId is required on every /v1 call", retryable: false }, 400);
  await assert.rejects(
    () => fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, CALL_OPTIONS),
    (err: unknown) => err instanceof AtlasError && err.envelope.code === "TASK_ID_REQUIRED" && !err.retryable,
  );

  resetS2STokenCache();
  stub("not json at all", 502);
  await assert.rejects(
    () => fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, CALL_OPTIONS),
    (err: unknown) => err instanceof AtlasError && err.envelope.code === "UNKNOWN",
  );
});

test("the callee's own retryable answer wins over any status-based guess", async () => {
  // A commercial ceiling can arrive as 429 and must NOT be retried - only the
  // body can tell it apart from a capacity gate that clears on its own.
  stub({ code: "QUOTA_EXCEEDED", message: "no quota left", retryable: false }, 429);
  await assert.rejects(
    () => fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, CALL_OPTIONS),
    (err: unknown) => err instanceof AtlasError && !err.retryable,
  );

  resetS2STokenCache();
  stub({ code: "RATE_LIMITED", message: "slow down", retryable: true, retryAfterMs: 1500 }, 429);
  await assert.rejects(
    () => fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, CALL_OPTIONS),
    (err: unknown) => err instanceof AtlasError && err.retryable && err.retryAfterMs === 1500,
  );
});

test("an upstream account refusal is non-retryable with or without the retry field", async () => {
  for (const retryable of [false, undefined]) {
    resetS2STokenCache();
    const calls = stub({ code: "UPSTREAM_ACCOUNT_REFUSED", message: "provider account rejected", retryable }, 503);
    await assert.rejects(
      () => fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, CALL_OPTIONS),
      (err: unknown) => err instanceof AtlasError && err.envelope.code === "UPSTREAM_ACCOUNT_REFUSED" && !err.retryable,
    );
    assert.equal(calls.length, 1);
  }
});

test("a 501 is never retryable, even though the status range says 5xx", async () => {
  // The capability simply does not exist upstream; retrying re-pays the timeout
  // forever. A status-range test cannot express this, which is why there is a
  // code table behind it.
  stub({ code: "MODEL_NOT_IMPLEMENTED", message: "no model serves this" }, 501);
  await assert.rejects(
    () => fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, CALL_OPTIONS),
    (err: unknown) => err instanceof AtlasError && !err.retryable,
  );

  resetS2STokenCache();
  stub({ code: "PROVIDER_UNAVAILABLE", message: "provider down" }, 503);
  await assert.rejects(
    () => fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, CALL_OPTIONS),
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

  const out = await fetchChatCompletion(getAtlasClientConfig()!, IDENTITY, MESSAGES, CALL_OPTIONS);
  assert.equal(out.message.content, "hello");
  assert.equal(atlasCalls, 2, "one retry, not more");
  assert.equal(mints, 2, "the cached token was dropped and re-minted");
});

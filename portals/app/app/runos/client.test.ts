import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getRunosClientConfig, runosDiscover, runosInvoke, verifyRunosConnectivity } from "./client";
import { resetS2STokenCache } from "../lib/s2s-token";

// These pin the wire details that are easy to get subtly wrong and impossible to
// notice locally: the accept header (a missing media type is a 406 with no hint),
// the placement of _meta (inside `arguments` makes every tool answer
// caller_error/missing_metadata), and the fact that a capability failure arrives
// as HTTP 200 rather than an error status.

const OIDC = {
  OIDC_ISSUER: "http://accounts.internal",
  OIDC_CLIENT_ID: "vxtpl",
  OIDC_CLIENT_SECRET: "s3cret",
  RUNOS_API_URL: "http://worker-02:3120",
};
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
const IDENTITY = { subjectToken: "user-access-token" };
const CALL = { taskId: "vxtpl-task-1", identity: IDENTITY };

interface Capture {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** First call answers the token mint; every later call answers with `result`. */
function stub(result: unknown, status = 200): Capture[] {
  const calls: Capture[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/oidc/token")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 300 }), { status: 200 });
    }
    calls.push({
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });
    return new Response(JSON.stringify(result), { status, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  return calls;
}

beforeEach(() => {
  for (const k of Object.keys(OIDC)) saved[k] = process.env[k];
  Object.assign(process.env, OIDC);
  resetS2STokenCache();
});

afterEach(() => {
  for (const k of Object.keys(OIDC)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  globalThis.fetch = realFetch;
  resetS2STokenCache();
});

test("config needs only a base URL - the bearer is minted, not configured", () => {
  assert.ok(getRunosClientConfig());
  delete process.env.RUNOS_API_URL;
  assert.equal(getRunosClientConfig(), null);
});

test("a tool call posts JSON-RPC to /v1/mcp with both accept media types", async () => {
  const calls = stub({ jsonrpc: "2.0", id: 1, result: { structuredContent: { capabilities: [] } } });
  await runosDiscover(getRunosClientConfig()!, "run python", CALL);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://worker-02:3120/v1/mcp");
  // Missing either media type is a 406 from the transport, with no useful body.
  assert.match(calls[0].headers.accept, /application\/json/);
  assert.match(calls[0].headers.accept, /text\/event-stream/);
  assert.equal(calls[0].headers.authorization, "Bearer tok");
  assert.equal(calls[0].body.jsonrpc, "2.0");
  assert.equal(calls[0].body.method, "tools/call");
});

test("_meta.vxture sits on params, NOT inside arguments", async () => {
  const calls = stub({ jsonrpc: "2.0", id: 1, result: { structuredContent: { capabilities: [] } } });
  await runosDiscover(getRunosClientConfig()!, "run python", CALL);

  const params = calls[0].body.params as Record<string, unknown>;
  const meta = params._meta as { vxture?: Record<string, unknown> } | undefined;
  assert.ok(meta?.vxture, "_meta.vxture must be a sibling of name/arguments");
  assert.equal(meta.vxture.task_id, "vxtpl-task-1");
  const args = params.arguments as Record<string, unknown>;
  assert.equal(args._meta, undefined, "_meta inside arguments makes every tool answer missing_metadata");
  assert.equal(args.query, "run python");
});

test("delegation forwards the MINTED token, never the user's session token", async () => {
  const calls = stub({ jsonrpc: "2.0", id: 1, result: { structuredContent: {} } });
  await runosInvoke(getRunosClientConfig()!, "runos.code-sandbox", "run_code", { code: "print(1)" }, {
    ...CALL,
    delegate: true,
  });
  const params = calls[0].body.params as Record<string, unknown>;
  const vxture = (params._meta as { vxture: Record<string, unknown> }).vxture;
  // Runos verifies the delegation token with audience "runos". A session token
  // is minted with aud = our own client id, so forwarding it fails every invoke
  // with caller_error/invalid_delegation - and looks like a capability fault.
  assert.equal(vxture.delegation_token, "tok", "must be the minted aud=runos token");
  assert.notEqual(vxture.delegation_token, IDENTITY.subjectToken);
  const args = params.arguments as Record<string, unknown>;
  assert.equal(args.capability_id, "runos.code-sandbox");
  assert.equal(args.operation, "run_code");
  assert.deepEqual(args.arguments, { code: "print(1)" });
});

test("a service-mode call sends no delegation token - there is no user to delegate", async () => {
  const calls = stub({ jsonrpc: "2.0", id: 1, result: { structuredContent: {} } });
  await runosInvoke(getRunosClientConfig()!, "x.y", "op", {}, {
    taskId: "t-1",
    identity: { workspaceId: "ws-1" },
    delegate: true,
  });
  const params = calls[0].body.params as Record<string, unknown>;
  const vxture = (params._meta as { vxture: Record<string, unknown> }).vxture;
  assert.equal(vxture.delegation_token, undefined);
});

test("a capability failure arrives as HTTP 200 with isError, not an error status", async () => {
  stub({
    jsonrpc: "2.0",
    id: 1,
    result: {
      isError: true,
      structuredContent: { error_class: "capability_error", error_code: "provider_unavailable", retryable: true },
    },
  });
  const res = await runosInvoke(getRunosClientConfig()!, "x.y", "op", {}, CALL);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.failure.error_class, "capability_error");
  assert.equal(res.failure.retryable, true);
});

test("a success unwraps structuredContent and lifts the FLAT _meta_vxture call id", async () => {
  stub({
    jsonrpc: "2.0",
    id: 1,
    // The published contract documents `_meta.vxture`; the server emits this
    // flat key, and the server is what answers.
    result: { structuredContent: { stdout: "42", _meta_vxture: { call_id: "c-1", version_resolved: "1.0.0" } } },
  });
  const res = await runosInvoke(getRunosClientConfig()!, "x.y", "op", {}, CALL);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.callId, "c-1");
  assert.equal(res.data.stdout, "42");
});

test("the nested _meta.vxture form is read too, since doc and code disagree", async () => {
  stub({
    jsonrpc: "2.0",
    id: 1,
    result: { structuredContent: { stdout: "42", _meta: { vxture: { call_id: "c-2" } } } },
  });
  const res = await runosInvoke(getRunosClientConfig()!, "x.y", "op", {}, CALL);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.callId, "c-2");
});

test("a distributed Skill result exposes its content, not a result payload", async () => {
  stub({
    jsonrpc: "2.0",
    id: 1,
    result: {
      // Runos distributes skills and never executes them (ADR-006): what comes
      // back is the SKILL.md for the caller's own runtime.
      content: [{ type: "text", text: "# How to summarize\n1. Read it." }],
      structuredContent: { _meta_vxture: { call_id: "c-3", result_kind: "distributed", content_digest: "sha256:x" } },
    },
  });
  const res = await runosInvoke(getRunosClientConfig()!, "x.y", "op", {}, CALL);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.meta?.result_kind, "distributed");
  assert.match(res.text ?? "", /How to summarize/);
});

test("the well-known probe reads transport/tools and never a protocol version", async () => {
  stub({
    service: "runos",
    transport: { kind: "mcp-streamable-http", path: "/v1/mcp" },
    tools: [{ name: "runos_discover", description: "..." }, { name: "runos_invoke", description: "..." }],
  });
  const out = await verifyRunosConnectivity(getRunosClientConfig()!, IDENTITY);
  assert.equal(out.transport, "mcp-streamable-http");
  assert.equal(out.path, "/v1/mcp");
  assert.deepEqual(out.tools, ["runos_discover", "runos_invoke"]);
});

test("a transport-level failure throws rather than being read as a result", async () => {
  stub({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "not acceptable" } }, 406);
  await assert.rejects(() => runosDiscover(getRunosClientConfig()!, "q", CALL), /runos 406/);
});

test("a JSON-RPC error is not mistaken for a capability failure", async () => {
  stub({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "unknown tool" } });
  await assert.rejects(() => runosDiscover(getRunosClientConfig()!, "q", CALL), /jsonrpc -32601/);
});

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runSkill } from "./skill-runner";
import { resetS2STokenCache } from "../lib/s2s-token";
import { runRunosSample } from "../platform-demo/runos-sample";

// What a capability answers is not all for the model.
//
// Runos puts its own bookkeeping in `_meta.vxture` (call_id, version_resolved) -
// routing exhaust that answers nothing the user asked. It used to arrive flat as
// `_meta_vxture`, and the code that stripped it was written against that flat
// shape; when Runos moved to the nested form the strip silently stopped matching
// and the gateway's ids rode into the prompt. Nothing failed, which is the whole
// problem: a leak into a prompt has no error to notice.
//
// The other half matters as much. `_meta` is MCP's namespaced metadata slot and
// we own exactly one key inside it, so a capability's own `_meta` entries must
// survive. Dropping the object wholesale would be us deciding, on the
// capability's behalf, that its metadata is worthless.

const ENV = {
  OIDC_ISSUER: "http://accounts.internal",
  OIDC_CLIENT_ID: "vxtpl",
  OIDC_CLIENT_SECRET: "s3cret",
  RUNOS_API_URL: "http://worker-02:3120",
  PLATFORM_DEMO_RUNOS_CAPABILITY_ID: "markitdown.document-to-markdown",
};
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

const OPTS = { taskId: "vxtpl-task-1", identity: { subjectToken: "user-access-token" } };
const HISTORY = [{ role: "user" as const, content: "summarize this" }];

/** Answers the four MCP tools in sequence; `payload` is what invoke returns. */
function stub(
  payload: Record<string, unknown>,
  options: { riskLevel?: string; acknowledged?: boolean; sample?: boolean } = {},
) {
  const calls: { name: string; arguments: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/oidc/token")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 300 }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      params?: { name?: string; arguments: Record<string, unknown> };
    };
    const tool = body.params?.name;
    if (body.params && tool) calls.push({ name: tool, arguments: body.params.arguments });
    const structured = answer(tool, payload, options);
    return new Response(JSON.stringify({ result: { isError: false, structuredContent: structured } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return calls;
}

function answer(
  tool: string | undefined,
  payload: Record<string, unknown>,
  options: { riskLevel?: string; acknowledged?: boolean; sample?: boolean },
): Record<string, unknown> {
  const capabilityId = options.sample ? ENV.PLATFORM_DEMO_RUNOS_CAPABILITY_ID : "markitdown/convert";
  if (tool === "runos_discover") {
    return { capabilities: [{
      capability_id: capabilityId,
      primitive_type: "connector",
      operations: [{ operation: "convert_to_markdown", risk_level: "read" }],
    }] };
  }
  if (tool === "runos_resolve") {
    return {
      capability_id: capabilityId,
      primitive_type: "connector",
      version: "1.0.0",
      contract: {
        operations: [{ operation: "convert_to_markdown", riskLevel: options.riskLevel, inputSchema: { properties: { uri: { type: "string" } }, required: ["uri"] } }],
      },
    };
  }
  if (tool === "runos_invoke") return payload;
  return { acknowledged: options.acknowledged ?? false };
}

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

test("the gateway's own _meta.vxture never reaches the model", async () => {
  stub({ markdown: "# Title", _meta: { vxture: { call_id: "c-1", version_resolved: "1.0.0" } } });

  const outcome = await runSkill("summarize", HISTORY, OPTS);

  assert.equal(outcome.status, "ran");
  assert.match(outcome.detail, /# Title/);
  // The three ways this leak has actually shown up.
  assert.doesNotMatch(outcome.detail, /call_id/);
  assert.doesNotMatch(outcome.detail, /c-1/);
  assert.doesNotMatch(outcome.detail, /version_resolved/);
  // Stripping the only key must take the empty husk with it.
  assert.doesNotMatch(outcome.detail, /_meta/);
});

test("a capability's own _meta keys survive - we own only `vxture`", async () => {
  stub({
    markdown: "# Title",
    _meta: { vxture: { call_id: "c-1" }, "markitdown/pages": 3 },
  });

  const outcome = await runSkill("summarize", HISTORY, OPTS);

  assert.equal(outcome.status, "ran");
  assert.match(outcome.detail, /markitdown\/pages/);
  assert.match(outcome.detail, /3/);
  assert.doesNotMatch(outcome.detail, /call_id/);
});

test("a payload with no _meta at all is passed through untouched", async () => {
  stub({ markdown: "# Title", pages: 3 });

  const outcome = await runSkill("summarize", HISTORY, OPTS);

  assert.equal(outcome.status, "ran");
  assert.equal(outcome.detail, JSON.stringify({ markdown: "# Title", pages: 3 }));
});

test("a non-object _meta is left alone rather than destructured", async () => {
  // Defensive: `_meta` is whatever came off the wire. Spreading a string would
  // silently explode it into numbered character keys.
  stub({ markdown: "# Title", _meta: "unexpected" });

  const outcome = await runSkill("summarize", HISTORY, OPTS);

  assert.equal(outcome.status, "ran");
  assert.match(outcome.detail, /unexpected/);
});

const convertedSample = { markdown: "# Vxture acceptance sample\n\nWeekly progress report." };

test("the acceptance sample converts an inline HTML document and records an acknowledged invocation", async () => {
  const calls = stub({ ...convertedSample, _meta: { vxture: { call_id: "call-1" } } },
    { sample: true, riskLevel: "read", acknowledged: true });
  const outcome = await runRunosSample(OPTS);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.receipt, "call-1");
  assert.deepEqual(calls.map(({ name }) => name), ["runos_discover", "runos_resolve", "runos_invoke", "runos_report_outcome"]);
  const invocation = calls[2].arguments;
  assert.equal(invocation.operation, "convert_to_markdown");
  assert.equal(invocation.capability_id, ENV.PLATFORM_DEMO_RUNOS_CAPABILITY_ID);
  assert.equal(invocation.version, "1.0.0");
  const uri = (invocation.arguments as { uri: string }).uri;
  const [mediaType, document] = uri.split(",");
  assert.equal(mediaType, "data:text/html;base64");
  assert.match(Buffer.from(document, "base64").toString(), /<h1>Vxture acceptance sample<\/h1>/);
});

test("the acceptance sample requires a read operation, converted content and outcome acknowledgement", async () => {
  const denied = stub({}, { sample: true, riskLevel: "write", acknowledged: true });
  assert.equal((await runRunosSample(OPTS)).ok, false);
  assert.deepEqual(denied.map(({ name }) => name), ["runos_discover", "runos_resolve"]);

  const meta = { _meta: { vxture: { call_id: "call-2" } } };
  const empty = stub(meta, { sample: true, riskLevel: "read", acknowledged: true });
  assert.equal((await runRunosSample(OPTS)).ok, false);
  assert.equal(empty[3].arguments.outcome, "failure");

  const unconfirmed = stub({ ...convertedSample, ...meta }, { sample: true, riskLevel: "read" });
  const result = await runRunosSample(OPTS);
  assert.equal(result.ok, false);
  assert.equal(result.receipt, "call-2");
  assert.equal(unconfirmed[3].arguments.outcome, "success");
});

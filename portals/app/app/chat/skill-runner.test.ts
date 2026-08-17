import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runSkill } from "./skill-runner";
import { resetS2STokenCache } from "../lib/s2s-token";

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
};
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

const OPTS = { taskId: "vxtpl-task-1", identity: { subjectToken: "user-access-token" } };
const HISTORY = [{ role: "user" as const, content: "summarize this" }];

/** Answers the four MCP tools in sequence; `payload` is what invoke returns. */
function stub(payload: Record<string, unknown>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/oidc/token")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 300 }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { params?: { name?: string } };
    const structured = answer(body.params?.name, payload);
    return new Response(JSON.stringify({ result: { isError: false, structuredContent: structured } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
}

function answer(tool: string | undefined, payload: Record<string, unknown>): Record<string, unknown> {
  if (tool === "runos_discover") {
    return { capabilities: [{ capability_id: "markitdown/convert", name: "convert", description: "summarize document text" }] };
  }
  if (tool === "runos_resolve") {
    return {
      capability_id: "markitdown/convert",
      contract: {
        operations: [{ operation: "convert_to_markdown", inputSchema: { properties: { uri: { type: "string" } }, required: ["uri"] } }],
      },
    };
  }
  if (tool === "runos_invoke") return payload;
  return { ok: true };
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

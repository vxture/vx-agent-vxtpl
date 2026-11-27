import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runSkill } from "./skill-runner";
import { resetS2STokenCache } from "../lib/s2s-token";
import { runRunosSample } from "../platform-demo/runos-sample";
import { AtlasChatResolver, ChatConversionError, ChatInferenceError, ChatWebSearchError } from "./resolver";
import { AtlasError } from "./atlas-client";
import { DOCUMENT_CONVERSION_SKILL, WEB_SEARCH_SKILL } from "./types";

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
  options: { riskLevel?: string; acknowledged?: boolean; sample?: boolean; failAtlas?: boolean;
    search?: boolean; searchFailure?: boolean; searchText?: string[] } = {},
) {
  const calls: { name: string; arguments: Record<string, unknown>; taskId?: string }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/oidc/token")) {
      const claims = { workspace_id: "ws-1", tenant_id: "7f1d1a1e-0000-4000-8000-00000000abcd" };
      const token = "fixture." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".signature";
      return Response.json({ access_token: token, expires_in: 300 });
    }
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (String(input).endsWith("/v1/chat")) {
      calls.push({ name: "atlas", arguments: body, taskId: body.taskId });
      if (options.failAtlas) {
        return Response.json({ code: "PROVIDER_UNAVAILABLE", requestId: "atlas-failed-request" }, { status: 502 });
      }
      return Response.json({
        id: "atlas-request-1", modelCode: "served-model",
        message: { role: "assistant", content: "The report is weekly." },
      });
    }
    const { params } = body as {
      params?: { name?: string; arguments: Record<string, unknown>; _meta?: { vxture?: { task_id?: string } } };
    };
    const tool = params?.name;
    if (params && tool) calls.push({ name: tool, arguments: params.arguments, taskId: params._meta?.vxture?.task_id });
    const structured = options.search ? searchAnswer(tool, payload, options.acknowledged) : answer(tool, payload, options);
    const content = tool === "runos_invoke" ? options.searchText?.map((text) => ({ type: "text", text })) : undefined;
    const isError = tool === "runos_invoke" && Boolean(options.searchFailure);
    return new Response(JSON.stringify({ result: { isError, structuredContent: structured, content } }), {
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

function searchAnswer(tool: string | undefined, payload: Record<string, unknown>, acknowledged?: boolean): Record<string, unknown> {
  const search = { operation: "web_search_exa", risk_level: "read" };
  const connector = { capability_id: "exa.web-research", primitive_type: "connector" };
  if (tool === "runos_discover") return { capabilities: [
    { capability_id: "k-dense-ai.exa-search", primitive_type: "skill", operations: [{ operation: "fetch", risk_level: "read" }] },
    { ...connector, operations: [search] },
  ] };
  if (tool === "runos_resolve") return { ...connector, version: "1.0.0", contract: { operations: [
    { operation: "web_fetch_exa", riskLevel: "read" },
    { operation: search.operation, riskLevel: "read" },
  ] } };
  if (tool === "runos_invoke") return payload;
  return { acknowledged };
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

test("the chat workflow sends the converted document to Atlas under the Runos task ID", async () => {
  const calls = stub({ ...convertedSample, _meta: { vxture: { call_id: "runos-call-1" } } },
    { sample: true, riskLevel: "read", acknowledged: true });
  const resolver = new AtlasChatResolver({ baseUrl: "https://atlas.test" });
  const history = [{ role: "user" as const, content: "<h1>Weekly report</h1>" }];
  const reply = await resolver.reply(history, { workspaceId: "ws-1", mint: OPTS.identity }, {
    modelCode: "chat/default", skillCode: DOCUMENT_CONVERSION_SKILL,
  });
  assert.deepEqual(calls.map(({ name }) => name), ["runos_discover", "runos_resolve", "runos_invoke", "runos_report_outcome", "atlas"]);
  assert.ok(reply.taskId && calls.every(({ taskId }) => taskId === reply.taskId));
  assert.equal(reply.skill?.callId, "runos-call-1");
  assert.equal(reply.skill?.operation, "convert_to_markdown");
  assert.equal(reply.skill?.version, "1.0.0");
  assert.equal(reply.skill?.outcomeAcknowledged, true);
  assert.equal(reply.requestId, "atlas-request-1");
  const messages = calls[4].arguments.messages as { content: string }[];
  assert.match(messages[0].content, /Weekly progress report\./);
  assert.doesNotMatch(messages[0].content, /<h1>|runos-call-1/);

  const rejected = stub({}, { sample: true, riskLevel: "write" });
  await assert.rejects(
    resolver.reply(history, { workspaceId: "ws-1", mint: OPTS.identity }, {
      modelCode: "chat/default", skillCode: DOCUMENT_CONVERSION_SKILL,
    }),
    (error: unknown) => error instanceof ChatConversionError && error.skill.status === "unavailable"
      && error.taskId === rejected[0].taskId,
  );
  assert.deepEqual(rejected.map(({ name }) => name), ["runos_discover", "runos_resolve"]);

  const partial = stub({ ...convertedSample, _meta: { vxture: { call_id: "runos-partial-call" } } },
    { sample: true, riskLevel: "read", acknowledged: true, failAtlas: true });
  await assert.rejects(
    resolver.reply(history, { workspaceId: "ws-1", mint: OPTS.identity }, {
      modelCode: "chat/default", skillCode: DOCUMENT_CONVERSION_SKILL,
    }),
    (error: unknown) => error instanceof ChatInferenceError
      && error.taskId === partial[0].taskId
      && error.skill?.callId === "runos-partial-call"
      && error.skill.outcomeAcknowledged === true
      && error.cause instanceof AtlasError
      && error.cause.envelope.requestId === "atlas-failed-request",
  );
});

test("network search selects the entitled Exa connector and gives Atlas sourced evidence", async () => {
  const url = "https://example.org/company";
  const calls = stub({ _meta: { vxture: { call_id: "search-call", version_resolved: "1.0.0" } } }, {
    search: true, acknowledged: true, searchText: ["Provider notes", "Company profile: " + url],
  });
  const question = "Find the company business scope";
  const resolver = new AtlasChatResolver({ baseUrl: "https://atlas.test" });
  const result = await resolver.reply([{ role: "user", content: question }], { workspaceId: "ws-1", mint: OPTS.identity }, {
    modelCode: "chat/default", skillCode: WEB_SEARCH_SKILL,
  });
  assert.deepEqual(calls.map((call) => call.name), ["runos_discover", "runos_resolve", "runos_invoke", "runos_report_outcome", "atlas"]);
  const invoke = calls[2].arguments;
  assert.equal(invoke.capability_id, "exa.web-research");
  assert.equal(invoke.operation, "web_search_exa");
  assert.equal(invoke.version, "1.0.0");
  const args = invoke.arguments as Record<string, string>;
  assert.equal(args.query, question);
  assert.match(args.objective, /public sources/);
  assert.equal(calls[3].arguments.outcome, "success");
  assert.equal(result.skill?.outcomeAcknowledged, true);
  assert.deepEqual(result.skill?.sources, [url]);
  const atlasMessages = calls[4].arguments.messages as { content: string }[];
  assert.ok(atlasMessages[0].content.includes("Company profile: " + url));
});

test("network search preserves Runos errors and never answers without search evidence", async () => {
  const resolver = new AtlasChatResolver({ baseUrl: "https://atlas.test" });
  const errors = [
    { payload: { code: "CALLER_INVALID_ARGUMENTS", call_id: "search-failed" }, rejected: true, code: "CALLER_INVALID_ARGUMENTS", callId: "search-failed" },
    { payload: { _meta: { vxture: { call_id: "no-evidence" } } }, rejected: false, code: "WEB_SEARCH_NO_EVIDENCE", callId: "no-evidence" },
  ];
  for (const { payload, rejected, code, callId } of errors) {
    const calls = stub(payload, { search: true, searchFailure: rejected, acknowledged: true });
    await assert.rejects(resolver.reply(HISTORY, { workspaceId: "ws-1", mint: OPTS.identity }, {
      modelCode: "chat/default", skillCode: WEB_SEARCH_SKILL,
    }), (error: unknown) => error instanceof ChatWebSearchError && error.skill.errorCode === code
      && error.skill.callId === callId && error.taskId === calls[0].taskId);
    assert.deepEqual(calls.map((call) => call.name), ["runos_discover", "runos_resolve", "runos_invoke", "runos_report_outcome"]);
    assert.equal(calls[3].arguments.outcome, "failure");
  }
});

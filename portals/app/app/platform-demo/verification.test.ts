/**
 * Verifies provider prerequisites and both Atlas inference targets.
 * @package @vxtpl/app
 * @layer Application
 * @category Verification Test
 * @author AI-Generated
 * @date 2026-11-26
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import Redis from "ioredis";
import type { SignedWorkspace } from "../entitlement/product-authority";
import { resetS2STokenCache } from "../lib/s2s-token";
import { readPlatformReport, runPlatformProbe } from "./verification";

// Prerequisites

test("provider configuration is reported separately from a missing session", async () => {
  const keys = ["OIDC_RP_ENABLED", "PLATFORM_API_URL", "ATLAS_API_URL", "RUNOS_API_URL"] as const;
  const original = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    const report = await readPlatformReport(null);
    assert.equal(report.scopeKey, null);
    assert.equal(report.checks.session.state, "waiting");
    for (const [id, probe, setting] of [
      ["atlas", "atlas-inference", "ATLAS_API_URL"],
      ["atlasModels", "atlas-model-inference", "ATLAS_API_URL"],
      ["runos", "runos-invoke", "RUNOS_API_URL"],
    ] as const) {
      assert.equal(report.checks[id].state, "waiting");
      assert.match(report.checks[id].detail, new RegExp(setting));
      assert.equal(report.actions[probe], false);
      assert.match(report.actionDetails[probe], new RegExp(setting));
    }
    assert.equal(report.actions["c3-replay"], false);
  } finally {
    keys.forEach((key, index) => {
      const value = original[index];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

// Workspace fixture

const scope = { org_id: "org-fixture", workspace_id: "ws-fixture", product: "vxtpl" };
const subject = "usr_00000000-0000-4000-8000-000000000001";
const session: SignedWorkspace = {
  status: "ready", workspaceId: scope.workspace_id, sub: subject, accessToken: "fixture-user",
  scopeKey: "scope-fixture", sessionId: "session-fixture",
  user: {
    sub: subject, activeOrg: scope.org_id, activeOrgType: "organization", activeOrgName: null,
    activeWorkspace: scope.workspace_id, activeWorkspaceName: null, roles: [], accountStatus: "active",
    canManage: false, isWorkspaceOwner: false,
  },
};

// Acceptance flow

test("Atlas verification independently exercises the route and direct model paths", async (t) => {
  const environment = {
    OIDC_ISSUER: "http://accounts.internal", OIDC_CLIENT_ID: "vxtpl", OIDC_CLIENT_SECRET: "fixture-only",
    ATLAS_API_URL: "http://atlas.internal", PLATFORM_API_URL: "http://platform.internal",
    PLATFORM_DEMO_WORKSPACE_ID: session.workspaceId, PLATFORM_DEMO_SUBJECT: session.sub,
    RUNOS_API_URL: "", DATABASE_URL: "",
  };
  const original = Object.entries(environment).map(([key]) => [key, process.env[key]] as const);
  Object.assign(process.env, environment);
  t.after(() => {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetS2STokenCache();
  });

  // Redis reserves the daily attempt only after live target selection succeeds.
  t.mock.method(Redis.prototype, "connect", async () => {});
  const keys = new Map<string, string>();
  const write = t.mock.method(Redis.prototype, "set", async (key: string, value: string, _mode: string, _ttl: number, nx?: string) => {
    if (nx === "NX" && keys.has(key)) return null;
    keys.set(key, value);
    return "OK";
  });
  const read = t.mock.method(Redis.prototype, "mget", async (...names: string[]) => names.map((key) => keys.get(key) ?? null));
  let granted = true;
  let modelActive = true;
  let typedCatalog = true;
  let modelAllowed = true;
  let catalogReads = 0;
  const route = "acceptance-dialogue";
  const model = {
    modelCode: "acceptance-testing-model", modelName: "Acceptance model", provider: "fixture-provider",
    protocol: "openai-compatible", capabilities: ["text"], deprecatedAt: null,
  };
  const direct = { probe: "atlas-model-inference", modelCode: model.modelCode } as const;
  const routed = { probe: "atlas-inference" } as const;
  const calls: { endpointCode?: string; modelCode?: string }[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    switch (url.pathname) {
      case "/.well-known/openid-configuration":
        return Response.json({ issuer: url.origin, jwks_uri: `${url.origin}/oidc/jwks` });
      case "/oidc/jwks":
        return Response.json({ keys: [{ kty: "RSA" }] });
      case "/oidc/token": {
        const form = new URLSearchParams(String(init?.body));
        assert.equal(form.get("subject_token"), session.accessToken);
        const aud = form.get("audience");
        const payload = Buffer.from(JSON.stringify({
          ...scope, aud, mode: "obo", scope: `tool:${aud}`, sub: subject, act: { sub: scope.product },
        })).toString("base64url");
        return Response.json({ access_token: `fixture.${payload}.signature`, expires_in: 300 });
      }
      case "/platform/product-access":
        return Response.json({ ...scope, subject, allowed: true });
      case "/platform/product-roster":
        return Response.json({ ...scope, authorization_mode: "assigned_seats", version: "1", nextCursor: null, items: [] });
      case "/platform/entitlements":
        return Response.json({ ...scope, status: "active", tier: "pro", bundled: false, limits: {}, quota_pools: [] });
      case "/v1/model-routes":
        return Response.json({ endpoints: granted ? [{ endpointCode: route, category: "chat", state: "active" }] : [] });
      case "/v1/models": {
        catalogReads++;
        const entries = [
          { ...model, state: modelActive ? "active" : "inactive", modelType: "chat" },
          { ...model, modelCode: "different-vector-model", state: "active", modelType: "embedding", capabilities: ["chat"] },
          { ...model, modelCode: "different-rank-model", state: "active", modelType: "rerank" },
          { ...model, modelCode: "legacy-model", state: "active" },
        ];
        return Response.json(typedCatalog ? entries : entries.map((entry) => ({ ...entry, modelType: undefined })));
      }
      case "/v1/chat": {
        const body = JSON.parse(String(init?.body));
        const target = body.modelCode ? { modelCode: body.modelCode } : { endpointCode: body.endpointCode };
        assert.ok(!body.modelCode || !body.endpointCode);
        calls.push(target);
        if (body.modelCode && !modelAllowed) return Response.json({ code: "NOT_ENTITLED" }, { status: 403 });
        return Response.json({ id: "atlas-receipt", modelCode: "atlas-serving-model", message: { content: "Reply" } });
      }
      default:
        throw new Error(`Unexpected request: ${url}`);
    }
  });

  const report = await readPlatformReport(session);
  assert.deepEqual(report.checks.atlas, { state: "verified", detail: `${route} \u53ef\u7528` });
  assert.equal(report.actions["atlas-inference"], true);
  assert.equal(report.actions["atlas-model-inference"], true);
  assert.deepEqual(report.atlasModelChoices, [{ code: model.modelCode, name: model.modelName, provider: model.provider }]);
  assert.deepEqual(report.receipts, {});

  process.env.PLATFORM_DEMO_SUBJECT = "another-operator";
  const ordinaryReport = await readPlatformReport(session);
  assert.equal(ordinaryReport.actions["atlas-model-inference"], false);
  assert.deepEqual(ordinaryReport.atlasModelChoices, []);
  assert.equal((await runPlatformProbe(session, direct)).status, 403);
  assert.equal(catalogReads, 1);
  assert.equal(read.mock.callCount(), 1);
  process.env.PLATFORM_DEMO_SUBJECT = session.sub;

  typedCatalog = false;
  const legacyAtlas = await readPlatformReport(session);
  assert.equal(legacyAtlas.actions["atlas-inference"], true);
  assert.equal(legacyAtlas.checks.atlasModels.state, "unavailable");
  assert.equal(legacyAtlas.actions["atlas-model-inference"], false);
  assert.equal((await runPlatformProbe(session, direct)).status, 503);
  typedCatalog = true;
  granted = false;
  assert.equal((await runPlatformProbe(session, routed)).status, 403);
  assert.equal((await runPlatformProbe(session, { ...direct, modelCode: "different-vector-model" })).status, 409);
  modelActive = false;
  assert.equal((await runPlatformProbe(session, direct)).status, 409);
  assert.equal(write.mock.callCount(), 0);
  granted = true;
  modelActive = true;
  const { status, result } = await runPlatformProbe(session, routed);
  assert.equal(status, 200);
  assert.equal(result.receipt, "atlas-receipt");
  assert.equal(result.evidence?.provider === "atlas" && result.evidence.endpointCode, route);
  assert.equal(write.mock.callCount(), 2);

  const directReply = await runPlatformProbe(session, direct);
  assert.equal(directReply.status, 200);
  const directEvidence = directReply.result.evidence;
  assert.equal(directEvidence?.provider === "atlas" && directEvidence.requestedModelCode, model.modelCode);
  assert.equal(directEvidence?.provider === "atlas" && directEvidence.modelCode, "atlas-serving-model");
  assert.equal(directReply.result.responseText, "Reply");
  assert.equal(keys.size, 4);
  assert.equal((await runPlatformProbe(session, direct)).status, 409);
  assert.deepEqual(calls, [{ endpointCode: route }, { modelCode: model.modelCode }]);

  const restored = await readPlatformReport({ ...session, sessionId: "new-rp-session" });
  assert.equal(restored.actions["atlas-inference"], false);
  assert.equal(restored.actions["atlas-model-inference"], false);
  assert.deepEqual(restored.receipts, { "atlas-inference": result, "atlas-model-inference": directReply.result });
  const differentScope = await readPlatformReport({ ...session, scopeKey: "different-scope" });
  assert.deepEqual(differentScope.receipts, {});
  assert.equal(differentScope.actions["atlas-inference"], false);

  // Clear only the fixture's reservations to simulate another acceptance day.
  keys.clear();
  modelAllowed = false;
  const denied = await runPlatformProbe(session, direct);
  assert.equal(denied.status, 403);
  assert.equal(denied.result.ok, false);
  assert.equal(denied.result.receipt, undefined);
});

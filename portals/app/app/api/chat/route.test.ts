/**
 * Tests live Atlas route discovery and turn authorization with transport fixtures.
 * @package @vxtpl/app
 * @layer Application
 * @category Route Test
 * @author AI-Generated
 * @date 2026-11-26
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { resetChatRate } from "../../chat/rate-limit";
import { resetChatResolver } from "../../chat/resolver";
import { CHAT_SCOPE_HEADER } from "../../chat/types";
import { resetS2STokenCache } from "../../lib/s2s-token";
import { GET, POST } from "./route";

// Route flow

test("chat discovers a new Atlas route, rechecks it at send time, and fails closed", async (t) => {
  const environment = {
    DEPLOY_STAGE: "dev",
    OIDC_RP_ENABLED: "off",
    OIDC_ISSUER: "http://accounts.internal",
    OIDC_CLIENT_ID: "vxtpl",
    OIDC_CLIENT_SECRET: "fixture-only",
    ATLAS_API_URL: "http://atlas.internal",
    MOCK_TIER: "pro",
    DATABASE_URL: "",
  };
  const original = Object.entries(environment).map(([key]) => [key, process.env[key]] as const);
  Object.assign(process.env, environment);
  t.after(() => {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetChatRate();
    resetChatResolver();
    resetS2STokenCache();
  });

  const newRoute = "workspace-dialogue";
  const chatCalls: { endpointCode?: string; modelCode?: string }[] = [];
  const directCode = "granted-chat-model";
  const grantedModel = {
    modelCode: directCode, modelName: "Granted chat model", provider: "fixture",
    protocol: "openai", capabilities: [], state: "active", modelType: "chat", deprecatedAt: null,
  };
  const jwt = Buffer.from(JSON.stringify({ workspace_id: "ws_local_dev" })).toString("base64url");
  const token = `fixture.${jwt}.signature`;
  let granted = true;
  let directlyGranted = true;
  let readable = true;
  let inferenceUnavailable = false;
  let failedTaskId: string | undefined;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    switch (String(input)) {
      case "http://accounts.internal/oidc/token":
        return Response.json({ access_token: token, expires_in: 300 });
      case "http://atlas.internal/v1/model-routes":
        assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${token}`);
        return readable ? Response.json({ endpoints: [
          { endpointCode: "chat/default", category: "chat", state: "inactive" },
          { endpointCode: "chat/documents", category: "embedding", state: "active" },
          { endpointCode: "chat/ghost", category: null, state: "missing" },
          ...(granted ? [{ endpointCode: newRoute, category: "chat", state: "active" }] : []),
        ] }) : Response.json({ code: "TEMPORARY_ERROR" }, { status: 503 });
      case "http://atlas.internal/v1/models?scope=caller":
        assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${token}`);
        return Response.json(directlyGranted ? [grantedModel,
          { ...grantedModel, modelCode: "embedding-fixture", modelType: "embedding" },
        ] : []);
      case "http://atlas.internal/v1/chat": {
        assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${token}`);
        const { endpointCode, modelCode, taskId } = JSON.parse(String(init?.body));
        chatCalls.push(modelCode ? { modelCode } : { endpointCode });
        assert.ok(Boolean(modelCode) !== Boolean(endpointCode));
        if (inferenceUnavailable) {
          failedTaskId = taskId;
          return Response.json({ code: "PROVIDER_UNAVAILABLE", requestId: "failed-receipt" }, { status: 502 });
        }
        return Response.json({ message: { role: "assistant", content: "Reply" }, modelCode: "serving-model", id: "receipt" });
      }
      default:
        throw new Error(`Unexpected request: ${String(input)}`);
    }
  });

  // Catalog and turn assertions

  const send = (modelCode?: string, target?: { modelCode?: string; endpointCode?: string }) => POST(new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { [CHAT_SCOPE_HEADER]: "development" },
    body: JSON.stringify({ history: [{ role: "user", content: "Hello" }], modelCode, target }),
  }));

  const catalog = await (await GET()).json();
  assert.deepEqual(catalog.models, [{ code: newRoute, label: newRoute, allowed: true, requiredTier: "pro" }]);
  assert.equal(catalog.defaultModelCode, newRoute);
  assert.equal(catalog.atlasSource, "live");
  assert.deepEqual(catalog.atlasDirectModels, [{ code: directCode, name: grantedModel.modelName, provider: grantedModel.provider }]);
  assert.equal((await send("chat/documents")).status, 403);
  assert.equal((await (await send()).json()).message.content, "Reply");
  assert.equal((await send(newRoute)).status, 200);

  process.env.MOCK_TIER = "starter";
  const starter = await (await GET()).json();
  assert.equal(starter.defaultModelCode, null);
  assert.deepEqual(starter.atlasDirectModels, []);
  assert.equal(starter.atlasDirectRequiredTier, "pro");
  assert.equal((await send(newRoute)).status, 403);
  process.env.MOCK_TIER = "pro";

  granted = false;
  assert.deepEqual((await (await GET()).json()).models, []);
  const denied = await send(newRoute);
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, "MODEL_NOT_GRANTED");

  readable = false;
  const unavailable = await send();
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, "MODEL_CATALOG_UNAVAILABLE");
  resetChatRate();
  const directOnly = await (await GET()).json();
  assert.equal(directOnly.atlasRouteCatalogAvailable, false);
  assert.equal(directOnly.atlasDirectModels[0].code, directCode);
  assert.equal((await send(undefined, { modelCode: directCode })).status, 200);
  process.env.MOCK_TIER = "starter";
  assert.equal((await send(undefined, { modelCode: directCode })).status, 403);
  process.env.MOCK_TIER = "pro";
  assert.equal((await send(undefined, { modelCode: "embedding-fixture" })).status, 403);
  assert.equal((await send(undefined, { modelCode: directCode, endpointCode: newRoute })).status, 400);
  directlyGranted = false;
  assert.equal((await send(undefined, { modelCode: directCode })).status, 403);
  assert.deepEqual(chatCalls, [{ endpointCode: newRoute }, { endpointCode: newRoute }, { modelCode: directCode }]);

  directlyGranted = true;
  inferenceUnavailable = true;
  resetChatRate();
  const failure = await send(undefined, { modelCode: directCode });
  assert.equal(failure.status, 502);
  const { evidence } = await failure.json();
  assert.ok(failedTaskId);
  assert.equal(evidence.taskId, failedTaskId);
  assert.equal(evidence.atlasRequestId, "failed-receipt");
  assert.equal(evidence.atlasErrorCode, "PROVIDER_UNAVAILABLE");
});

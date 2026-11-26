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
  const chatCalls: string[] = [];
  const jwt = Buffer.from(JSON.stringify({ workspace_id: "ws_local_dev" })).toString("base64url");
  const token = `fixture.${jwt}.signature`;
  let granted = true;
  let readable = true;
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
      case "http://atlas.internal/v1/chat":
        assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${token}`);
        chatCalls.push(JSON.parse(String(init?.body)).endpointCode);
        return Response.json({ message: { role: "assistant", content: "Reply" }, modelCode: "serving-model", id: "receipt" });
      default:
        throw new Error(`Unexpected request: ${String(input)}`);
    }
  });

  // Catalog and turn assertions

  const send = (modelCode?: string) => POST(new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { [CHAT_SCOPE_HEADER]: "development" },
    body: JSON.stringify({ history: [{ role: "user", content: "Hello" }], modelCode }),
  }));

  const catalog = await (await GET()).json();
  assert.deepEqual(catalog.models, [{ code: newRoute, label: newRoute, allowed: true, requiredTier: "pro" }]);
  assert.equal(catalog.defaultModelCode, newRoute);
  assert.equal((await send("chat/documents")).status, 403);
  assert.equal((await (await send()).json()).message.content, "Reply");
  assert.equal((await send(newRoute)).status, 200);

  process.env.MOCK_TIER = "starter";
  assert.equal((await (await GET()).json()).defaultModelCode, null);
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
  assert.deepEqual(chatCalls, [newRoute, newRoute]);
});

/**
 * Asserts the product authority reads only the signed-in scope.
 * @package @vxtpl/app
 * @layer Application
 * @category Test
 * @author AI-Generated
 * @date 2026-11-26
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { productAuthority, type SignedWorkspace } from "./product-authority";
import { resetS2STokenCache } from "../lib/s2s-token";

const scope = {
  sub: "usr_7f1d1a1e-0000-4000-8000-00000000abcd",
  workspaceId: "7f1d1a1e-0000-4000-8000-00000000defa",
  orgId: "7f1d1a1e-0000-4000-8000-00000000faab",
};
const workspace: SignedWorkspace = {
  status: "ready", sub: scope.sub, workspaceId: scope.workspaceId,
  accessToken: "fixture-user-token", sessionId: "fixture-session", scopeKey: "fixture-scope",
  user: {
    sub: scope.sub, activeOrg: scope.orgId, activeOrgType: null, activeOrgName: null,
    activeWorkspace: scope.workspaceId, activeWorkspaceName: null, roles: [],
    accountStatus: "active", canManage: false, isWorkspaceOwner: false,
  },
};

test("authority verifies the ticket and payload scopes and exposes only a roster summary", async (t) => {
  const previous = globalThis.fetch;
  const keys = { OIDC_ISSUER: "http://127.0.0.1:8011", OIDC_CLIENT_ID: "vxtpl", OIDC_CLIENT_SECRET: "test-client-secret" };
  const env = Object.fromEntries(Object.keys(keys).map((key) => [key, process.env[key]]));
  Object.assign(process.env, keys);
  t.after(() => {
    globalThis.fetch = previous;
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetS2STokenCache();
  });

  const responseScope = { org_id: scope.orgId, workspace_id: scope.workspaceId, product: "vxtpl" };
  const calls: string[] = [];
  let ticketWorkspace = scope.workspaceId;
  let responseWorkspace = scope.workspaceId;
  let entitlementResponse: unknown = { status: null, tier: null, bundled: false, limits: {}, quota_pools: [] };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname === "/oidc/token") {
      const form = new URLSearchParams(String(init?.body));
      assert.equal(form.get("subject_token"), workspace.accessToken);
      assert.equal(form.get("audience"), "vxture");
      assert.equal(form.has("workspace_id"), false);
      const claims = { ...responseScope, workspace_id: ticketWorkspace, sub: scope.sub, aud: "vxture", scope: "tool:vxture", act: { sub: "vxtpl" }, mode: "obo" };
      const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
      return Response.json({ access_token: `fixture.${encoded}.signature`, expires_in: 300 });
    }

    const headers = new Headers(init?.headers);
    assert.match(headers.get("authorization") ?? "", /^Bearer fixture\./);
    assert.equal(headers.has("x-vxture-internal-auth"), false);
    assert.equal(init?.cache, "no-store");
    if (url.pathname === "/platform/product-access") {
      assert.equal(url.search, "");
      return Response.json({ ...responseScope, workspace_id: responseWorkspace, subject: scope.sub, allowed: false });
    }
    if (url.pathname === "/platform/entitlements") {
      assert.equal(url.searchParams.get("workspace_id"), scope.workspaceId);
      assert.equal(url.searchParams.get("product"), "vxtpl");
      if (!entitlementResponse) return new Response(null, { status: 503 });
      return Response.json({ product: "vxtpl", workspace_id: responseWorkspace, ...entitlementResponse });
    }
    assert.equal(url.pathname, "/platform/product-roster");
    assert.equal(url.search, "?limit=10");
    return Response.json({
      ...responseScope, version: "revision", authorization_mode: "assigned_seats", nextCursor: null,
      items: [{ subject: scope.sub, eligible: true, display_name: "Example Member" }],
    });
  };

  const authority = await productAuthority("http://127.0.0.1:8012", workspace);
  assert.equal(await authority.allowed(), false);
  assert.deepEqual(await authority.rosterSummary(), { count: 1, hasMore: false });
  assert.equal((await authority.entitlements()).tier, null);
  entitlementResponse = {};
  await assert.rejects(authority.entitlements, /Invalid entitlement response/);
  entitlementResponse = null;
  await assert.rejects(authority.entitlements, /HTTP 503/);
  responseWorkspace = "unexpected-workspace";
  await assert.rejects(authority.allowed, /unexpected scope/);
  resetS2STokenCache();
  ticketWorkspace = "unrelated-workspace";
  await assert.rejects(productAuthority("http://127.0.0.1:8012", workspace), /does not match/);
  assert.deepEqual(calls, [
    "/oidc/token", "/platform/product-access", "/platform/product-roster",
    "/platform/entitlements", "/platform/entitlements", "/platform/entitlements",
    "/platform/product-access", "/oidc/token",
  ]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canManageWorkspace,
  isWorkspaceOwner,
  parseRoles,
  profileFromIdToken,
  toAuthUser,
} from "./claims";

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64(payload)}.sig`;
}

test("profileFromIdToken reads display claims, name first", () => {
  const p = profileFromIdToken(
    fakeJwt({ sub: "usr_1", name: "Ada L", nickname: "ada", picture: "https://a/img.png", email: "ada@x.com" }),
  );
  assert.equal(p.displayName, "Ada L");
  assert.equal(p.picture, "https://a/img.png");
  assert.equal(p.email, "ada@x.com");
});

test("profileFromIdToken falls back nickname -> preferred_username and survives junk", () => {
  assert.equal(profileFromIdToken(fakeJwt({ nickname: "ada" })).displayName, "ada");
  assert.equal(profileFromIdToken(fakeJwt({ preferred_username: "ada.l" })).displayName, "ada.l");
  assert.equal(profileFromIdToken(fakeJwt({ name: "   " })).displayName, null);
  assert.deepEqual(profileFromIdToken("not-a-jwt"), { displayName: null, picture: null, email: null });
});

// These tests exist specifically to prevent regressing the two CONFIRMED arda
// bugs (product_240 section 6 #27/#28): treating `admin` as a role, and comparing
// bare role codes without the scope prefix.

test("scope-prefixed owner/manager roles are recognized as manage", () => {
  assert.equal(canManageWorkspace(["workspace:owner"]), true);
  assert.equal(canManageWorkspace(["org:owner"]), true);
  assert.equal(canManageWorkspace(["workspace:manager"]), true);
  assert.equal(canManageWorkspace(["org:member", "workspace:manager"]), true);
});

test("non-manage governance roles are rejected", () => {
  assert.equal(canManageWorkspace(["workspace:member"]), false);
  assert.equal(canManageWorkspace(["workspace:readonly"]), false);
  assert.equal(canManageWorkspace(["workspace:guest"]), false);
  assert.equal(canManageWorkspace([]), false);
});

test("bug #28 guard: a BARE `owner` (no scope prefix) is not a manage role", () => {
  // The platform always issues scope-prefixed roles. A bare code is malformed
  // and must fail closed - never match `owner`/`manager` without the prefix.
  assert.equal(canManageWorkspace(["owner"]), false);
  assert.equal(canManageWorkspace(["manager"]), false);
});

test("bug #27 guard: `admin` is never a manage role (platform never issues it)", () => {
  assert.equal(canManageWorkspace(["admin"]), false);
  assert.equal(canManageWorkspace(["org:admin"]), false);
  assert.equal(canManageWorkspace(["workspace:admin"]), false);
});

test("role comparison is case-insensitive and trimmed", () => {
  assert.equal(canManageWorkspace([" WORKSPACE:OWNER "]), true);
});

test("isWorkspaceOwner matches workspace:owner only (subscription is workspace-level)", () => {
  assert.equal(isWorkspaceOwner(["workspace:owner"]), true);
  assert.equal(isWorkspaceOwner(["org:owner"]), false);
  assert.equal(isWorkspaceOwner(["workspace:manager"]), false);
});

test("parseRoles splits scope and role, lowercased", () => {
  assert.deepEqual(parseRoles(["org:owner", "workspace:manager"]), [
    { scope: "org", role: "owner" },
    { scope: "workspace", role: "manager" },
  ]);
  assert.deepEqual(parseRoles(["bare"]), [{ scope: "", role: "bare" }]);
});

test("toAuthUser maps claims and derives the gates; entitlement is not consumed", () => {
  const user = toAuthUser({
    sub: "usr_abc",
    active_org: "org_1",
    active_org_type: "organization",
    active_workspace: "ws_1",
    roles: ["workspace:owner"],
    account_status: "active",
  });
  assert.equal(user.sub, "usr_abc");
  assert.equal(user.activeWorkspace, "ws_1");
  assert.equal(user.canManage, true);
  assert.equal(user.isWorkspaceOwner, true);
  assert.equal(user.accountStatus, "active");
});

test("toAuthUser tolerates missing roles/context", () => {
  const user = toAuthUser({ sub: "usr_x" });
  assert.deepEqual(user.roles, []);
  assert.equal(user.canManage, false);
  assert.equal(user.activeWorkspace, null);
});

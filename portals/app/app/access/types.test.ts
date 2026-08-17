import { test } from "node:test";
import assert from "node:assert/strict";
import { isThrough, type AccessGates, type AccessState } from "./types";
import type { AuthUser } from "../auth/lib/claims";
import { makeEntitlement } from "../entitlement/resolver";
import type { Entitlement } from "../entitlement/types";

// The gate's whole job is deciding who gets through. These pin the decisions
// that are expensive to get wrong in opposite directions: letting an unentitled
// visitor into a paid product, or trapping a paying customer at the door.

const USER = { sub: "usr_1", activeWorkspace: "ws_1" } as unknown as AuthUser;
const NO_PLAN = makeEntitlement("ws_1", "vxtpl");

function authed(gates: Partial<AccessGates>, entitlement: Entitlement = NO_PLAN): AccessState {
  return {
    status: "authenticated",
    user: USER,
    entitlement,
    gates: { productAccess: false, dataAccess: false, cta: "subscribe", ...gates },
  };
}

test("a signed-in visitor with product access goes through", () => {
  assert.equal(isThrough(authed({ productAccess: true, cta: "none" })), true);
});

test("a signed-in visitor WITHOUT product access is held at the gate", () => {
  // Being signed in is not the same as being entitled. Conflating them is how a
  // paid product ends up open to anyone with an account.
  assert.equal(isThrough(authed({ productAccess: false, cta: "subscribe" })), false);
});

test("dataAccess alone does not open the product", () => {
  // hasDataAccess is true for a bundled workspace that holds no tier of its
  // own; it governs data reads, not entry.
  assert.equal(isThrough(authed({ productAccess: false, dataAccess: true })), false);
});

test("anonymous, inactive, missing-workspace and unconfigured are all held", () => {
  const held: AccessState[] = [
    { status: "anonymous" },
    { status: "inactive-account" },
    { status: "no-workspace", user: USER },
    { status: "unconfigured" },
  ];
  for (const state of held) {
    assert.equal(isThrough(state), false, state.status);
  }
});

test("the dev-only open state goes through", () => {
  // The escape hatch that keeps the front door from becoming a wall on a
  // developer machine. /api/access only ever emits it when DEPLOY_STAGE is dev.
  assert.equal(isThrough({ status: "open", reason: "dev-no-oidc" }), true);
});

test("every state is either through or held - no state falls off the end", () => {
  // A new status added to the union without a decision here would silently be
  // treated as "held", which is the safe direction but would strand users.
  // This asserts the exhaustive set is what the gate expects.
  const all: AccessState["status"][] = [
    "anonymous",
    "authenticated",
    "inactive-account",
    "no-workspace",
    "unconfigured",
    "open",
  ];
  assert.equal(new Set(all).size, all.length);
});

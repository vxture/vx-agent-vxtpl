import { test } from "node:test";
import assert from "node:assert/strict";
import { canUseFeature, minTierFor } from "./capability";
import { makeEntitlement } from "./resolver";

test("canUseFeature denies when the entitlement has no tier (no product access)", () => {
  const e = makeEntitlement("ws", "p", { tier: null });
  assert.equal(canUseFeature(e, "model:chat-cheap"), false);
});

test("canUseFeature denies an unknown feature key at any tier", () => {
  const e = makeEntitlement("ws", "p", { tier: "enterprise" });
  assert.equal(canUseFeature(e, "model:does-not-exist"), false);
});

test("canUseFeature is cumulative: enterprise has everything free has", () => {
  const free = makeEntitlement("ws", "p", { tier: "free" });
  const enterprise = makeEntitlement("ws", "p", { tier: "enterprise" });
  assert.equal(canUseFeature(free, "model:chat-cheap"), true);
  assert.equal(canUseFeature(enterprise, "model:chat-cheap"), true);
});

test("canUseFeature gates a starter-only feature away from free", () => {
  const free = makeEntitlement("ws", "p", { tier: "free" });
  const starter = makeEntitlement("ws", "p", { tier: "starter" });
  assert.equal(canUseFeature(free, "skill:summarize"), false);
  assert.equal(canUseFeature(starter, "skill:summarize"), true);
});

test("minTierFor reports the lowest tier that unlocks a feature", () => {
  assert.equal(minTierFor("model:chat-cheap"), "free");
  assert.equal(minTierFor("skill:summarize"), "starter");
  assert.equal(minTierFor("skill:data-analysis"), "enterprise");
  assert.equal(minTierFor("model:does-not-exist"), null);
});

// The game ladder (20-specs/20): each step unlocks exactly one capability
// bundle, and business/enterprise add nothing beyond pro on the game axis.
test("game ladder: free plays, starter unlocks history, pro unlocks the board", () => {
  assert.equal(minTierFor("game:play"), "free");
  assert.equal(minTierFor("game:unlimited-runs"), "starter");
  assert.equal(minTierFor("game:history"), "starter");
  assert.equal(minTierFor("game:leaderboard"), "pro");
  assert.equal(minTierFor("game:trend"), "pro");
});

test("game ladder is cumulative through the upper tiers", () => {
  for (const tier of ["pro", "business", "enterprise"] as const) {
    const e = makeEntitlement("ws", "p", { tier });
    for (const key of ["game:play", "game:unlimited-runs", "game:history", "game:leaderboard", "game:trend"]) {
      assert.equal(canUseFeature(e, key), true, `${tier} should have ${key}`);
    }
  }
});

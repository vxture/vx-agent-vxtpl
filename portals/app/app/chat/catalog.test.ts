import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseChatModel, gatedMockModels, gatedSkills, findSkill, SKILL_CATALOG } from "./catalog";
import { makeEntitlement } from "../entitlement/resolver";

test("findSkill looks up a product example by code", () => {
  assert.equal(findSkill("web-search")?.label, "Web search");
  assert.equal(findSkill("nope"), undefined);
});

test("an explicit unavailable route never falls through to the default", () => {
  const free = makeEntitlement("ws", "p", { tier: "free" });
  const models = gatedMockModels(free);
  assert.equal(chooseChatModel(models), "chat/cheap");
  assert.equal(chooseChatModel(models, "chat/default"), undefined);
  assert.equal(chooseChatModel([], "chat/cheap"), undefined);
});

test("gated mock models mark nothing allowed with no subscription", () => {
  const e = makeEntitlement("ws", "p", { tier: null });
  const gated = gatedMockModels(e);
  assert.equal(gated.length, 3);
  assert.ok(gated.every((m) => !m.allowed));
});

test("offline models and skills allow strictly more at a higher tier", () => {
  const free = makeEntitlement("ws", "p", { tier: "free" });
  const enterprise = makeEntitlement("ws", "p", { tier: "enterprise" });
  const freeAllowed = gatedMockModels(free).filter((m) => m.allowed).length + gatedSkills(free).filter((s) => s.allowed).length;
  const entAllowed =
    gatedMockModels(enterprise).filter((m) => m.allowed).length + gatedSkills(enterprise).filter((s) => s.allowed).length;
  assert.ok(entAllowed > freeAllowed);
  assert.equal(entAllowed, gatedMockModels(enterprise).length + SKILL_CATALOG.length);
});

test("gated options report the correct requiredTier hint", () => {
  const e = makeEntitlement("ws", "p", { tier: "free" });
  const pro = gatedMockModels(e).find((m) => m.code === "chat/pro");
  assert.equal(pro?.allowed, false);
  assert.equal(pro?.requiredTier, "pro");
});

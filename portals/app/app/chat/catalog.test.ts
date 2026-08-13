import { test } from "node:test";
import assert from "node:assert/strict";
import { gatedModels, gatedSkills, findModel, findSkill, MODEL_CATALOG, SKILL_CATALOG } from "./catalog";
import { makeEntitlement } from "../entitlement/resolver";

test("findModel/findSkill look up by code", () => {
  assert.equal(findModel("chat/default")?.label, "Standard");
  assert.equal(findModel("nope"), undefined);
  assert.equal(findSkill("web-search")?.label, "Web search");
  assert.equal(findSkill("nope"), undefined);
});

test("gatedModels marks nothing allowed with no subscription", () => {
  const e = makeEntitlement("ws", "p", { tier: null });
  const gated = gatedModels(e);
  assert.equal(gated.length, MODEL_CATALOG.length);
  assert.ok(gated.every((m) => !m.allowed));
});

test("gatedModels/gatedSkills allow strictly more at a higher tier", () => {
  const free = makeEntitlement("ws", "p", { tier: "free" });
  const enterprise = makeEntitlement("ws", "p", { tier: "enterprise" });
  const freeAllowed = gatedModels(free).filter((m) => m.allowed).length + gatedSkills(free).filter((s) => s.allowed).length;
  const entAllowed =
    gatedModels(enterprise).filter((m) => m.allowed).length + gatedSkills(enterprise).filter((s) => s.allowed).length;
  assert.ok(entAllowed > freeAllowed);
  assert.equal(entAllowed, MODEL_CATALOG.length + SKILL_CATALOG.length);
});

test("gated options report the correct requiredTier hint", () => {
  const e = makeEntitlement("ws", "p", { tier: "free" });
  const reasoning = gatedModels(e).find((m) => m.code === "chat/reasoning");
  assert.equal(reasoning?.allowed, false);
  assert.equal(reasoning?.requiredTier, "pro");
});

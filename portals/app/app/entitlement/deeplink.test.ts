import { test } from "node:test";
import assert from "node:assert/strict";
import { subscribeUrl } from "./deeplink";

test("conversion starts on website pricing with the product as its only parameter", () => {
  const u = new URL(subscribeUrl());
  assert.equal(u.pathname, "/pricing");
  assert.deepEqual([...u.searchParams.keys()], ["product"]);
  assert.ok(u.searchParams.get("product"));
});

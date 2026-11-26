/**
 * Regression cases for same-origin entry and recovery destinations.
 * @package @vxtpl/app
 * @layer Application
 * @category Test
 * @author AI-Generated
 * @date 2026-11-25
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { gateDestination, gateFailureHref, gateLoginHref } from "./destination";

test("login returns through the gate before opening the original deep link", () => {
  const destination = "/home/work?page=3#recent";
  const login = new URL(gateLoginHref(destination), "https://product.invalid");
  const entry = new URL(login.searchParams.get("returnTo")!, login);
  assert.equal(entry.pathname, "/gate");
  assert.equal(entry.searchParams.get("from"), destination);
  const failure = new URL(gateFailureHref(entry.pathname + entry.search, "cancelled"), entry);
  assert.equal(failure.searchParams.get("from"), destination);
  assert.equal(failure.searchParams.get("result"), "cancelled");
});

test("gate destinations cannot point to another gate, authentication, APIs or another origin", () => {
  for (const path of ["https://external.invalid", "//external.invalid", "/gate?from=/gate", "/a/../auth/login", "/%61pi", "/%2Fexternal.invalid", "/%5cexternal.invalid", "/%"]) {
    assert.equal(gateDestination(path), "/home", path);
  }
});

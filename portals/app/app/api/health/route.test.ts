import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route";

// The identity-block shape and honest-fallback behavior (025 section 3/6) are
// @vxture/shared's own responsibility (its own test suite covers that). This
// tests OUR wiring: the route calls buildHealthIdentity with vxtpl's real
// service/product identity, and honest fallbacks flow through end to end when
// the build env is absent - no fabrication (025 section 6).

const PROV_KEYS = ["APP_VERSION", "GIT_SHA", "DEPLOY_STAGE", "BUILD_TIME"] as const;

async function withNoProvenanceEnv(fn: () => Promise<void> | void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of PROV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  try {
    await fn();
  } finally {
    for (const k of PROV_KEYS) {
      if (saved[k] !== undefined) process.env[k] = saved[k];
    }
  }
}

test("GET wires service/product from BRAND and returns the full identity block", async () => {
  await withNoProvenanceEnv(async () => {
    const res = GET();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.service, "vxtpl-app");
    assert.equal(body.product, "vxtpl");
    for (const k of ["version", "gitSha", "stage", "buildTime", "time"]) {
      assert.equal(typeof body[k], "string", `${k} must be a string`);
    }
  });
});

test("honest fallbacks flow through when build env is absent - no fabrication", async () => {
  await withNoProvenanceEnv(async () => {
    const body = await GET().json();
    assert.equal(body.version, "dev");
    assert.equal(body.gitSha, "unknown");
    assert.equal(body.stage, "dev");
    assert.equal(body.buildTime, "unknown");
    assert.notEqual(body.version, "1.0.0");
    assert.notEqual(body.gitSha, "dev");
    assert.notEqual(body.stage, "local");
  });
});

/**
 * Check that missing providers and anonymous visits never offer billable probes.
 * @package @vxtpl/app
 * @layer Application
 * @category Tests
 * @author AI-Generated
 * @date 2026-11-26
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readPlatformReport } from "./verification";

test("provider configuration is reported separately from a missing session", async () => {
  const keys = ["OIDC_RP_ENABLED", "PLATFORM_API_URL", "ATLAS_API_URL", "RUNOS_API_URL"] as const;
  const original = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    const report = await readPlatformReport(null);
    assert.equal(report.scopeKey, null);
    assert.equal(report.checks.session.state, "waiting");
    for (const [id, probe, setting] of [
      ["atlas", "atlas-inference", "ATLAS_API_URL"],
      ["runos", "runos-invoke", "RUNOS_API_URL"],
    ] as const) {
      assert.equal(report.checks[id].state, "waiting");
      assert.match(report.checks[id].detail, new RegExp(setting));
      assert.equal(report.actions[probe], false);
      assert.match(report.actionDetails[probe], new RegExp(setting));
    }
    assert.equal(report.actions["c3-replay"], false);
  } finally {
    keys.forEach((key, index) => {
      const value = original[index];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { assertMockAllowed, deployStage, isDeployedStage } from "./deploy-stage";

const ORIGINAL = { stage: process.env.DEPLOY_STAGE, allow: process.env.ALLOW_MOCK_ON_DEPLOY };

afterEach(() => {
  if (ORIGINAL.stage === undefined) delete process.env.DEPLOY_STAGE;
  else process.env.DEPLOY_STAGE = ORIGINAL.stage;
  if (ORIGINAL.allow === undefined) delete process.env.ALLOW_MOCK_ON_DEPLOY;
  else process.env.ALLOW_MOCK_ON_DEPLOY = ORIGINAL.allow;
});

test("an unset or unrecognized DEPLOY_STAGE is dev, not a deployed stage", () => {
  delete process.env.DEPLOY_STAGE;
  assert.equal(deployStage(), "dev");
  assert.equal(isDeployedStage(), false);
  process.env.DEPLOY_STAGE = "staging-ish";
  assert.equal(deployStage(), "dev");
});

test("mock resolvers are allowed in dev", () => {
  process.env.DEPLOY_STAGE = "dev";
  assert.doesNotThrow(() => assertMockAllowed("entitlement (C2)", "PLATFORM_API_URL"));
});

test("mock resolvers are refused on production and beta", () => {
  for (const stage of ["production", "beta"]) {
    process.env.DEPLOY_STAGE = stage;
    delete process.env.ALLOW_MOCK_ON_DEPLOY;
    assert.throws(
      () => assertMockAllowed("entitlement (C2)", "PLATFORM_API_URL"),
      /refusing to start on stage/,
      stage,
    );
  }
});

test("ALLOW_MOCK_ON_DEPLOY=on is the deliberate override", () => {
  process.env.DEPLOY_STAGE = "production";
  process.env.ALLOW_MOCK_ON_DEPLOY = "on";
  assert.doesNotThrow(() => assertMockAllowed("entitlement (C2)", "PLATFORM_API_URL"));
});

test("only the exact value 'on' overrides - a truthy-looking value does not", () => {
  process.env.DEPLOY_STAGE = "production";
  process.env.ALLOW_MOCK_ON_DEPLOY = "true";
  assert.throws(() => assertMockAllowed("entitlement (C2)", "PLATFORM_API_URL"));
});

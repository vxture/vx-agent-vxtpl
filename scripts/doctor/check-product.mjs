#!/usr/bin/env node
/**
 * Evaluates local setup and publicly observable integration readiness.
 * @package vxture-vxtpl
 * @layer Application
 * @category Diagnostics
 * @author AI-Generated
 * @date 2026-11-26
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs, parseEnv } from "node:util";

// ============================================================================
// Configuration checks
// ============================================================================

const root = resolve(import.meta.dirname, "../..");
const sections = [];

function add(section, state, detail) {
  sections.push({ section, state, detail });
}

function requireKeys(env, section, keys) {
  const missing = keys.filter((key) => !env[key]?.trim());
  add(section, missing.length ? "pending" : "present",
    missing.length ? `Missing ${missing.join(", ")}` : "Required settings are present");
}

function inspectConfig(env, stage, product) {
  const slug = product.replace(/[-_]+/g, "-").replace(/-$/, "");
  const client = stage === "beta" ? slug + "-beta" : slug;
  requireKeys(env, "C1 account", ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI", "OIDC_POST_LOGOUT_REDIRECT_URI", "REDIS_URL"]);
  if (env.OIDC_CLIENT_ID && stage !== "dev" && env.OIDC_CLIENT_ID !== client) {
    add("C1 client binding", "pending", "Confirm the configured client is registered to this product and stage");
  }
  if (stage !== "dev" && env.OIDC_RP_ENABLED !== "on") add("C1 login", "failed", "Enable the OIDC relying party for this stage");
  if (env.OIDC_REDIRECT_URI) {
    try {
      const redirect = new URL(env.OIDC_REDIRECT_URI);
      if (redirect.pathname !== "/auth/callback" || redirect.search || redirect.hash ||
          (stage !== "dev" && redirect.protocol !== "https:")) throw new Error();
    } catch {
      add("C1 redirect", "failed", "Use the registered product origin and /auth/callback");
    }
  }
  requireKeys(env, "C2 entitlement", ["PLATFORM_API_URL"]);
  requireKeys(env, "C3 provisioning and usage", ["DATABASE_URL", "PROVISION_WEBHOOK_SECRET", "INTERNAL_JOB_TOKEN"]);
  requireKeys(env, "L1 provider demonstration", ["ATLAS_API_URL", "RUNOS_API_URL", "PLATFORM_DEMO_WORKSPACE_ID",
    "PLATFORM_DEMO_SUBJECT", "PLATFORM_DEMO_RUNOS_CAPABILITY_ID"]);
}

// ============================================================================
// Read-only runtime probes
// ============================================================================

async function readPublic(origin, path) {
  try {
    const response = await fetch(new URL(path, origin), { redirect: "error", signal: AbortSignal.timeout(6000) });
    if (!response.ok) return { status: response.status };
    return { status: response.status, body: await response.json() };
  } catch {
    return { status: "unreachable" };
  }
}

async function inspectRuntime(runtimeUrl, expectedVersion, product) {
  const origin = new URL(runtimeUrl);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (origin.username || origin.password || origin.search || origin.hash ||
      !(origin.protocol === "https:" || (origin.protocol === "http:" && loopback))) {
    throw new Error("Use a credential-free HTTPS URL or a loopback HTTP URL");
  }
  const [health, status, demo] = await Promise.all([
    readPublic(origin, "/api/health"),
    readPublic(origin, "/api/status"),
    readPublic(origin, "/api/platform-check"),
  ]);
  const build = health.body;
  const identity = build?.status === "ok" && build.product === product;
  const actualVersion = typeof build?.version === "string" && /^[a-zA-Z0-9._-]{1,64}$/.test(build.version) ? build.version : "unknown";
  if (!identity) add("Runtime identity", "failed", "The health reply does not identify the expected product");
  else if (expectedVersion && actualVersion !== expectedVersion) add("Runtime version", "failed", `Target serves ${actualVersion}`);
  else add("Runtime liveness", "observed", `Product health returned version ${actualVersion}`);

  const telemetry = status.body?.data;
  if (telemetry) {
    const healthy = telemetry.database?.reachable === true && telemetry.redis?.reachable === true;
    add("Runtime storage", healthy ? "observed" : "pending", healthy ? "PostgreSQL and Redis answered" : "PostgreSQL or Redis reachability is unconfirmed");
    const connections = status.body?.chat?.atlasApiConfigured === true && status.body?.capability?.runosApiConfigured === true;
    add("Runtime provider configuration", connections ? "present" : "pending", connections ? "Atlas and Runos URLs are reported" : "Atlas or Runos URL is unconfirmed");
  } else {
    add("Runtime status", "pending", `Status response ${status.status}`);
  }

  const checks = demo.body?.checks;
  const supported = ["issuer", "session", "exchange", "access", "roster", "entitlements", "provisioning", "atlas", "runos"];
  const currentDemo = checks && supported.every((key) => typeof checks[key]?.state === "string");
  add("Runtime demonstration", currentDemo ? "observed" : "pending",
    currentDemo ? "Nine-channel demonstration is available" : "Nine-channel demonstration is unconfirmed");
}

// ============================================================================
// Command
// ============================================================================

try {
  const { values } = parseArgs({ options: {
    env: { type: "string" },
    stage: { type: "string", default: "dev" },
    url: { type: "string" },
    "expect-version": { type: "string" },
    json: { type: "boolean", default: false },
  } });
  if (!["dev", "beta", "production"].includes(values.stage)) throw new Error("Stage must be dev, beta or production");
  if (values["expect-version"] && !values.url) throw new Error("--expect-version requires --url");
  const product = /productCode:\s*"([^"]+)"/.exec(readFileSync(join(root, "portals/packages/shared/src/brand.ts"), "utf8"))?.[1];
  if (!product) throw new Error("The template product code is missing");
  const envPath = values.env ? resolve(values.env) : join(root, ".env");
  if (values.env || existsSync(envPath)) {
    let file;
    try {
      file = parseEnv(readFileSync(envPath, "utf8"));
    } catch {
      throw new Error("Could not read the selected environment file");
    }
    inspectConfig(file, values.stage, product);
  } else {
    add("Local configuration", "pending", "Supply an environment file to validate registered settings");
  }
  if (values.url) await inspectRuntime(values.url, values["expect-version"], product);
  add("Live acceptance", "pending", "Use the designated signed-in workspace to verify seats, provisioning, usage and provider receipts, and central logout");
  if (values.json) console.log(JSON.stringify({ product, stage: values.stage, checks: sections }, null, 2));
  else for (const check of sections) console.log(`[${check.state}] ${check.section} - ${check.detail}`);
  if (sections.some((check) => check.state === "failed")) process.exitCode = 1;
} catch (error) {
  console.error(`[doctor] ${error.message}`);
  process.exitCode = 1;
}

#!/usr/bin/env node
/**
 * instantiate.mjs - turn this template into a concrete product repo.
 *
 * Usage:
 *   node scripts/init/instantiate.mjs <product_code> [--dry-run]
 *
 * Replaces the product-code placeholders throughout the repo and derives every
 * downstream name (product_240_repo-template.md section 2.7), then writes a
 * .env.example skeleton. Pure Node, zero dependencies.
 *
 * Placeholders:
 *   __PRODUCT_CODE__        raw code       - OIDC client, compose project/
 *                                            container prefix, image name
 *   __PRODUCT_CODE_SNAKE__  hyphens->'_'   - Postgres database name and role
 *   __PRODUCT_CODE_UPPER__  SNAKE upper    - env-var / secret names
 *   @product-code           npm scope      - workspace package scope. A separate
 *                                            token because __PRODUCT_CODE__ is not
 *                                            a valid npm name (uppercase + leading
 *                                            underscore); the template ships the
 *                                            valid placeholder scope `@product-code`
 *                                            so it builds un-instantiated, and this
 *                                            maps it to `@<code>`. `@`-anchored, so
 *                                            it never touches prose.
 *
 * The script excludes itself, VCS/build dirs, and binary files from replacement.
 * With --dry-run it reports what it would change and prints the generated
 * .env.example to stdout, without writing anything.
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, extname, resolve } from "node:path";

const CODE_RE = /^[a-z][a-z0-9_-]{0,31}$/;

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".pnpm-store",
  ".next",
  "dist",
  "build",
  "out",
  "coverage",
]);
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp",
  ".woff", ".woff2", ".ttf", ".eot", ".pdf",
  ".zip", ".gz", ".tar", ".exe",
]);

function fail(msg) {
  console.error(`[instantiate] ERROR: ${msg}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const code = argv.find((a) => !a.startsWith("-"));

if (!code) {
  console.error("Usage: node scripts/init/instantiate.mjs <product_code> [--dry-run]");
  process.exit(1);
}
if (!CODE_RE.test(code)) {
  fail(`product_code '${code}' must match ^[a-z][a-z0-9_-]{0,31}$`);
}

// --- Derivations (product_240 section 2.7) ---------------------------------
const snake = code.replaceAll("-", "_");
const upper = snake.toUpperCase();

const derived = {
  "product code (raw)": code,
  "OIDC clients": `${code} / ${code}-beta`,
  "compose project/containers": `${code}-app / ${code}-redis / ${code}-db`,
  "image name": `${code}-app`,
  "database name": `vxturebiz_${snake}_<env>  (env = beta | prod)`,
  "service role": `${snake}_svc`,
  "package scope": `@${code}/*`,
  "DB password secret": `${upper}_DB_SVC_PASSWORD`,
  "webhook secret": `${upper}_PROVISION_WEBHOOK_SECRET`,
  "webhook base URL var": `${upper}_WEBHOOK_BASE_URL`,
};

// --- Placeholder replacement ------------------------------------------------
const SELF = resolve(process.argv[1]);
const REPLACEMENTS = [
  ["__PRODUCT_CODE_UPPER__", upper],
  ["__PRODUCT_CODE_SNAKE__", snake],
  ["__PRODUCT_CODE__", code],
  ["@product-code", `@${code}`],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(".");
const changed = [];
for (const file of files) {
  if (resolve(file) === SELF) continue; // never rewrite this script
  if (BINARY_EXT.has(extname(file).toLowerCase())) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes(String.fromCharCode(0))) continue; // binary sniff (null byte)
  let next = text;
  for (const [ph, val] of REPLACEMENTS) next = next.replaceAll(ph, val);
  if (next !== text) {
    changed.push(relative(".", file).replaceAll("\\", "/"));
    if (!dryRun) writeFileSync(file, next);
  }
}

// --- .env.example skeleton --------------------------------------------------
const envExample = `# .env.example for ${code} - authoritative reference for every supported
# variable. Copy to .env and fill in. .env is git-ignored and never committed.
# Convention: values below are the prod defaults; a "BETA OVERRIDES" note marks
# any key whose beta value differs. Secret keys are present-but-empty with a
# procurement note; real values are injected via env, never committed.

# --- App ---
NODE_ENV=production
NEXT_PUBLIC_APP_ENV=production          # BETA OVERRIDES: beta
APP_PUBLISH_PORT=<assigned-at-registration>

# --- Database (${code}) ---
# Runtime connects as the least-privilege service role, not the DB owner.
POSTGRES_DB=vxturebiz_${snake}_prod     # BETA OVERRIDES: vxturebiz_${snake}_beta
POSTGRES_USER=${snake}_svc
POSTGRES_PASSWORD=                      # procure: ${upper}_DB_SVC_PASSWORD
DATABASE_URL=postgresql://${snake}_svc:@${code}-db:5432/vxturebiz_${snake}_prod

# --- Redis (RP session store) ---
REDIS_URL=redis://${code}-redis:6379

# --- Status dashboard (/status, /api/status) ---
STATUS_PAGE=public                       # public | authed (login required) | off
STATUS_SHOW_INFRA=on                     # on shows db host/name/role; off hides them

# --- C1 OIDC RP (080-rp section 2.11) ---
OIDC_ISSUER=https://accounts.vxture.com
OIDC_CLIENT_ID=${code}                   # BETA OVERRIDES: ${code}-beta
OIDC_CLIENT_SECRET=                      # procure: platform-issued client secret
OIDC_REDIRECT_URI=https://${code}.vxture.com/auth/callback
OIDC_SCOPES=openid profile email phone
OIDC_POST_LOGOUT_REDIRECT_URI=https://${code}.vxture.com/
OIDC_RP_ENABLED=on
RP_SESSION_TTL=2592000
RP_SESSION_COOKIE_NAME=__Host-vx_rp_session   # dev over http: vx_rp_session
NEXT_PUBLIC_APP_URL=https://${code}.vxture.com

# --- C2 entitlement / platform client ---
PLATFORM_API_URL=                        # internal-network base; unset -> Mock resolver
PLATFORM_INTERNAL_AUTH_TOKEN=            # procure: shared internal-auth secret (S2S)
NEXT_PUBLIC_CONSOLE_URL=https://console.vxture.com

# --- C3 provisioning webhook / usage ---
PROVISION_WEBHOOK_SECRET=               # procure: ${upper}_PROVISION_WEBHOOK_SECRET (platform key)
PROVISION_WEBHOOK_SECRET_NEXT=          # optional, rotation overlap
INTERNAL_JOB_TOKEN=                     # procure: gates POST /api/usage/flush

# --- Chat / Atlas model gateway (optional; unset -> offline Mock resolver) ---
ATLAS_API_URL=                          # internal-network base; unset -> Mock resolver
ATLAS_S2S_TOKEN=                        # procure: already-issued bearer JWT (aud=atlas, scope=tool:atlas)

# --- Runos capability plane (optional; unset -> /platform-check reports not configured) ---
RUNOS_API_URL=                          # internal-network base
RUNOS_S2S_TOKEN=                        # procure: already-issued bearer JWT (aud=runos, scope=tool:runos)
`;

const ENV_PATH = ".env.example";
if (!dryRun) writeFileSync(ENV_PATH, envExample);

// --- Report -----------------------------------------------------------------
console.log(`[instantiate] product_code = ${code}${dryRun ? "  (DRY RUN)" : ""}`);
console.log("[instantiate] derived names:");
for (const [k, v] of Object.entries(derived)) console.log(`  ${k.padEnd(28)} ${v}`);
console.log(`[instantiate] ${changed.length} file(s) ${dryRun ? "would change" : "changed"}:`);
for (const c of changed) console.log(`  ${c}`);
console.log(`[instantiate] .env.example ${dryRun ? "would be written" : "written"} (${ENV_PATH})`);
if (dryRun) {
  console.log("\n----- .env.example (dry run preview) -----");
  console.log(envExample);
}

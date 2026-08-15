#!/usr/bin/env node
/**
 * rename-product.mjs - turn a copy of vxtpl into a new Vxture product repo.
 *
 * Usage:
 *   node scripts/init/rename-product.mjs <product_code> [--dry-run]
 *
 * vxtpl carries no placeholders: every name in the tree is the literal `vxtpl`
 * value that runs in production. Creating a new product therefore means renaming,
 * not substituting - this script rewrites the whole name cascade in file contents
 * AND in file/directory names, then prints the follow-up a human still owns.
 *
 * The rename is SITE-AWARE, because one product code produces three different
 * lexical forms and a blind replace corrupts two of them:
 *
 *   raw    <code>          OIDC clients, compose project/containers, image name,
 *                          public vhost, package scope, stack root
 *   snake  <code> with -   Postgres database name and role - a hyphen is illegal
 *          mapped to _     in an unquoted Postgres identifier
 *   upper  SNAKE upper     platform-side secret names
 *
 * For `vxtpl` all three collapse (no hyphen), which is exactly why the site-aware
 * rules must be encoded here rather than discovered the first time somebody picks
 * a hyphenated code.
 *
 * Pure Node, zero dependencies.
 */

import { readdirSync, statSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, relative, extname, dirname, basename } from "node:path";

const CODE_RE = /^[a-z][a-z0-9_-]{0,31}$/;

/**
 * The code this repo currently carries. This script rewrites ITSELF along with
 * everything else, so after a rename this constant reads as the new code and the
 * copy can in turn be copied - renaming is a chain, not a one-shot from vxtpl.
 * (Node reads the whole file before executing it, so rewriting it mid-run is
 * safe.)
 */
const CURRENT = "vxtpl";

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

/**
 * Paths left untouched on purpose. These record what vxtpl did, when, and with
 * whom: rewriting `vxtpl` to the new code inside them would not carry history
 * forward, it would fabricate it - letters the new product never sent, batches it
 * never ran. The copy deletes or archives them instead (reported at the end).
 */
const HISTORY_PATHS = [
  "docs/80-liaison",
  "docs/70-workplan",
  "docs/60-operations/00-index.md",
];

function fail(msg) {
  console.error(`[rename] ERROR: ${msg}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const code = argv.find((a) => !a.startsWith("-"));

if (!code) {
  console.error("Usage: node scripts/init/rename-product.mjs <product_code> [--dry-run]");
  process.exit(1);
}
if (!CODE_RE.test(code)) {
  fail(`product_code '${code}' must match ^[a-z][a-z0-9_-]{0,31}$`);
}
if (code === CURRENT) {
  fail(`product_code is already '${CURRENT}' - nothing to rename`);
}

// --- Derivations ------------------------------------------------------------
const snake = code.replaceAll("-", "_");
const upper = snake.toUpperCase();

const derived = {
  "product code (raw)": code,
  "OIDC clients": `${code} / ${code}-beta`,
  "compose project/containers": `${code}-app / ${code}-redis / ${code}-db`,
  "image name": `${code}-app`,
  "database name": `vxturebiz_${snake}_prod`,
  "service role": `${snake}_svc`,
  "package scope": `@${code}/*`,
  "display name": titleCase(code),
  "DB password secret": `${upper}_DB_SVC_PASSWORD`,
  "webhook secret": `${upper}_PROVISION_WEBHOOK_SECRET`,
  "webhook base URL var": `${upper}_WEBHOOK_BASE_URL`,
  "stack root": `/srv/md0/${code}`,
  "public vhost": `${code}.vxture.com`,
};

// The three forms the CURRENT code already appears in. These must be derived,
// not hard-coded: once this repo has been renamed to a hyphenated code, its
// database and role names carry the UNDERSCORE form, and a table built only from
// the raw form would walk straight past them - leaving the next generation with
// `vxturebiz_my_prod_prod` inside a repo that thinks it is called `acme`.
const currentSnake = CURRENT.replaceAll("-", "_");
const currentUpper = currentSnake.toUpperCase();
/** Title case, for BRAND.displayName - the one place a human-facing name lives. */
const currentTitle = titleCase(CURRENT);

function titleCase(value) {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Ordered longest-match-first: every specific site is consumed before the generic
 * rules see the text, so `vxturebiz_vxtpl_prod` becomes `vxturebiz_my_prod_prod`
 * (snake) rather than the invalid `vxturebiz_my-prod_prod`.
 */
const REPLACEMENTS = [
  [currentUpper, upper],                                  // secret names
  [`vxturebiz_${currentSnake}_`, `vxturebiz_${snake}_`],  // database name
  [`${currentSnake}_svc`, `${snake}_svc`],                // service role
  [`@${CURRENT}`, `@${code}`],                            // npm scope
  [currentTitle, titleCase(code)],                        // BRAND.displayName
  [CURRENT, code],                                        // raw: containers, image, vhost, scope-free prose
  [currentSnake, snake],                                  // any snake site the specific rules did not cover
];

function isHistoryPath(rel) {
  return HISTORY_PATHS.some((h) => rel === h || rel.startsWith(`${h}/`));
}

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

/** Every directory under root, deepest first, so renaming a child never invalidates a parent path. */
function walkDirs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (SKIP_DIRS.has(name)) continue;
    walkDirs(full, out);
    out.push(full);
  }
  return out;
}

// --- Pass 1: file contents --------------------------------------------------
const changed = [];
const skippedHistory = [];
for (const file of walk(".")) {
  const rel = relative(".", file).replaceAll("\\", "/");
  if (BINARY_EXT.has(extname(file).toLowerCase())) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes(String.fromCharCode(0))) continue; // binary sniff (null byte)
  if (!REPLACEMENTS.some(([from]) => text.includes(from))) continue;
  if (isHistoryPath(rel)) {
    skippedHistory.push(rel);
    continue;
  }
  let next = text;
  for (const [from, to] of REPLACEMENTS) next = next.replaceAll(from, to);
  if (next !== text) {
    changed.push(rel);
    if (!dryRun) writeFileSync(file, next);
  }
}

// --- Pass 2: file and directory names ---------------------------------------
// Files first, then directories deepest-first: a path is only renamed once its
// children have already been handled under the old name.
const renamed = [];
function renamePath(full) {
  const name = basename(full);
  if (!REPLACEMENTS.some(([from]) => name.includes(from))) return;
  const rel = relative(".", full).replaceAll("\\", "/");
  if (isHistoryPath(rel)) return;
  let nextName = name;
  for (const [from, to] of REPLACEMENTS) nextName = nextName.replaceAll(from, to);
  if (nextName === name) return;
  const target = join(dirname(full), nextName);
  renamed.push(`${rel} -> ${relative(".", target).replaceAll("\\", "/")}`);
  if (!dryRun) renameSync(full, target);
}
for (const file of walk(".")) renamePath(file);
for (const dir of walkDirs(".")) renamePath(dir);

// --- Report -----------------------------------------------------------------
const tag = dryRun ? "  (DRY RUN)" : "";
console.log(`[rename] ${CURRENT} -> ${code}${tag}`);
console.log("[rename] derived names:");
for (const [k, v] of Object.entries(derived)) console.log(`  ${k.padEnd(28)} ${v}`);

console.log(`[rename] ${changed.length} file(s) ${dryRun ? "would be" : ""} rewritten:`);
for (const c of changed) console.log(`  ${c}`);

if (renamed.length) {
  console.log(`[rename] ${renamed.length} path(s) ${dryRun ? "would be" : ""} renamed:`);
  for (const r of renamed) console.log(`  ${r}`);
}

if (skippedHistory.length) {
  console.log(`[rename] ${skippedHistory.length} file(s) left untouched (vxtpl's own history):`);
  for (const s of skippedHistory) console.log(`  ${s}`);
}

console.log(`
[rename] Not done yet. This script only renames; the following are yours:

  1. Delete or archive vxtpl's history listed above - liaison correspondence,
     the batch tracker, and the tech-debt register belong to vxtpl, not to you.
  2. Replace docs/20-specs/ with your own product definition, and start a fresh
     ADR register in docs/30-design/decisions/ (ADR-001 onward).
  3. Run 'pnpm install' to regenerate pnpm-lock.yaml under the @${code} scope,
     then 'pnpm type-check:all && pnpm test' to confirm the tree is coherent.
  4. Work docs/50-deployment/10-platform-registration-checklist.md: the platform
     line must register product '${code}', issue the OIDC client pair, allocate a
     host port, and grant Atlas/Runos access before any real call succeeds.
  5. Work docs/50-deployment/20-github-bootstrap-checklist.md to create the repo
     and apply the branch-protection ruleset LAST.
  6. Re-point configs/edge/${code}.vxture.com.conf at your allocated port (it
     still carries vxtpl's 3210) and hand it to the edge operator.
`);

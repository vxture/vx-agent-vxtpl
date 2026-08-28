#!/usr/bin/env node
// SCA consistency guardrail: the watcher and the gate must scan the same way.
//
// There are two SCA runs in this repo and they exist for different reasons.
// `ci.yml`'s `audit` job is the HARD GATE on incoming change. `sca-watch.yml` is
// the scheduled scan of the trunk as it already stands - the case the gate
// structurally cannot see, because an advisory published against an unchanged
// lockfile is invisible until somebody pushes. A repo built from this template
// lost ten days to exactly that.
//
// Splitting one scan into two copies buys that coverage and creates a new way to
// be wrong: THE TWO CAN DRIFT. A watcher pinned to an older osv-scanner, or
// pointed at a different lockfile, or run without `--config`, reports "clean" on
// findings the gate would block. That is worse than having no watcher, because a
// watcher that says clean is read as evidence.
//
// FOUR ASSERTIONS:
//
//   1. Both pin the same OSV_SCANNER_VERSION.
//   2. Both verify the same sha256 for the downloaded binary. (The version alone
//      is not the artifact; the sha is what makes the pin mean anything.)
//   3. Both invoke osv-scanner with the same arguments - same lockfile, same
//      --config, same flags. A watch that forgets --config silently stops
//      applying the ignore baseline, so it disagrees with the gate in the one
//      direction nobody checks.
//   4. sca-watch.yml declares NO job whose name collides with the five required
//      status checks. Those names are a branch-protection contract; a second job
//      called `audit` produces a second context with that name, and what branch
//      protection then requires is not something anyone should have to reason
//      about.
//
// It does not check that the scanner is the LATEST - that is Dependabot's job,
// and a guardrail that fails because upstream shipped a release would be noise.

import { readFileSync } from "node:fs";

const STRICT = process.argv.includes("--strict");

const CI = ".github/workflows/ci.yml";
const WATCH = ".github/workflows/sca-watch.yml";

/** The authoritative set, same list as check-ruleset.mjs. */
const REQUIRED_CONTEXTS = ["quality-gate", "build", "test-coverage", "audit", "gitleaks"];

const problems = [];

const read = (f) => {
  try {
    return readFileSync(f, "utf8");
  } catch {
    problems.push(`${f} is missing - the trunk has no scheduled SCA scan`);
    return null;
  }
};

const ci = read(CI);
const watch = read(WATCH);

/** First capture of `re` in `src`, or null. */
const one = (src, re, what, file) => {
  const m = src.match(re);
  if (!m) {
    problems.push(`${file}: could not find ${what}`);
    return null;
  }
  return m[1].trim();
};

if (ci && watch) {
  const ciVersion = one(ci, /OSV_SCANNER_VERSION:\s*"([^"]+)"/, "OSV_SCANNER_VERSION", CI);
  const watchVersion = one(watch, /OSV_SCANNER_VERSION:\s*"([^"]+)"/, "OSV_SCANNER_VERSION", WATCH);
  if (ciVersion && watchVersion && ciVersion !== watchVersion) {
    problems.push(
      `osv-scanner version differs: ${CI} pins ${ciVersion}, ${WATCH} pins ${watchVersion}. ` +
        `The watcher would report clean on findings the gate blocks.`,
    );
  }

  const ciSha = one(ci, /sha256=([0-9a-f]{64})/, "the sha256 of the osv-scanner binary", CI);
  const watchSha = one(watch, /sha256=([0-9a-f]{64})/, "the sha256 of the osv-scanner binary", WATCH);
  if (ciSha && watchSha && ciSha !== watchSha) {
    problems.push(
      `osv-scanner sha256 differs between ${CI} and ${WATCH}. Same version, different artifact ` +
        `means at least one of the two pins is wrong.`,
    );
  }

  // Normalise: the watch redirects output and swallows the exit code on purpose,
  // so compare the invocation up to the first redirect only.
  const invocation = (src, file) => {
    const m = src.match(/osv-scanner scan ([^\n>|]+)/);
    if (!m) {
      problems.push(`${file}: could not find the osv-scanner invocation`);
      return null;
    }
    return m[1].replace(/\\\s*$/, "").trim().split(/\s+/).join(" ");
  };
  const ciArgs = invocation(ci, CI);
  const watchArgs = invocation(watch, WATCH);
  if (ciArgs && watchArgs && ciArgs !== watchArgs) {
    problems.push(
      `the two scans take different arguments:\n` +
        `      ${CI}:    osv-scanner scan ${ciArgs}\n` +
        `      ${WATCH}: osv-scanner scan ${watchArgs}`,
    );
  }
}

if (watch) {
  // `  <job-id>:` at two-space indent under `jobs:`, plus any `name:` it sets.
  const jobsBlock = watch.slice(watch.indexOf("\njobs:"));
  const ids = [...jobsBlock.matchAll(/^ {2}([A-Za-z0-9_-]+):$/gm)].map((m) => m[1]);
  const names = [...jobsBlock.matchAll(/^ {4}name:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  for (const context of [...ids, ...names]) {
    if (REQUIRED_CONTEXTS.includes(context)) {
      problems.push(
        `${WATCH} declares a job producing the check context "${context}", which is one of the ` +
          `five required checks. Two contexts with one name is not a state branch protection ` +
          `should be asked to resolve - rename the watch job.`,
      );
    }
  }
}

if (problems.length === 0) {
  console.log(
    `[sca-consistency] OK - the scheduled watch and the ci gate pin the same scanner and scan the same way.`,
  );
  process.exit(0);
}

console.error(`[sca-consistency] ${problems.length} problem(s):\n`);
for (const p of problems) console.error(`  - ${p}\n`);
console.error(
  `The watch exists to cover the idle trunk, which the gate cannot see. If the two disagree,\n` +
    `the watch reports clean on things the gate would block - and a watcher that says clean is\n` +
    `read as evidence.`,
);
process.exit(STRICT ? 1 : 0);

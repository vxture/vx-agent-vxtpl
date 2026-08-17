#!/usr/bin/env node
// Placeholder guardrail: `__SOMETHING__` tokens must not exist in this repo.
//
// vxtpl began as `vxture-template`, a tree of `__PRODUCT_CODE__` tokens that
// CI substituted at build time. ADR-001 removed that, and the reason is worth
// restating because it is the reason this check exists rather than a comment:
// the deployed artifact was not the repo. What ran in production was a rewrite
// of the source produced during the build, so reading the repo told you what
// production almost looked like. Every literal you can read here now is the
// literal that runs.
//
// `docs/90-memory/10-agent.md` has stated the rule since - "if you find a
// `__SOMETHING__` token outside docs/80-liaison/, it is a bug" - and nothing
// enforced it. A rule that only exists in prose survives exactly as long as
// everyone who reads it remembers it, which for a repo other products are
// copied from is not long enough.
//
// THE RULE
//
//   Anything that runs or ships   a `__X__` token is forbidden, no exceptions.
//   Markdown (prose, anywhere)    allowed ONLY as inline code: `__X__`
//   docs/80-liaison/              skipped - append-only frozen letters
//
// "Markdown anywhere" rather than "under docs/", because CLAUDE.md and
// README.md are prose too and they are the files most likely to need to name
// the thing. The exemption is about what a file IS, not where it sits.
//
// The backtick rule is not a loophole, it is the distinction itself: prose
// ABOUT a token always quotes it, and a live placeholder never does. That is
// what lets ADR-001 explain what it removed without this check calling the
// explanation a relapse.
//
// A product copied from vxtpl inherits this unchanged, which is the point - the
// copy is made by `rename-product.mjs` rewriting real names, never by filling
// blanks back in.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const STRICT = process.argv.includes("--strict");

/** Frozen history. Letters are appended, never edited - see CLAUDE.md. */
const FROZEN = "docs/80-liaison/";

/** Binary-ish and vendored paths a text scan has nothing useful to say about. */
const SKIP = /\.(png|jpg|jpeg|gif|ico|webp|woff2?|ttf|eot|pdf|lock)$|^pnpm-lock\.yaml$/i;

const TOKEN = /__[A-Z][A-Z0-9_]*__/g;

function tracked() {
  return execSync("git ls-files", { encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f && !SKIP.test(f) && !f.startsWith(FROZEN));
}

/** Every inline-code span on the line, so a quoted token can be recognised. */
function codeSpans(line) {
  return [...line.matchAll(/`[^`]*`/g)].map((m) => [m.index, m.index + m[0].length]);
}

function isQuoted(line, at, end) {
  return codeSpans(line).some(([from, to]) => at >= from && end <= to);
}

const findings = [];

for (const file of tracked()) {
  const isProse = file.endsWith(".md");
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // unreadable or binary - nothing to assert
  }
  if (!text.includes("__")) continue;

  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(TOKEN)) {
      const quoted = isProse && isQuoted(line, m.index, m.index + m[0].length);
      if (quoted) continue;
      findings.push({
        file,
        line: i + 1,
        token: m[0],
        why: isProse
          ? "prose may name a placeholder, but only as inline code (`" + m[0] + "`)"
          : "this file runs or ships - a placeholder here means the artifact is not the repo",
      });
    }
  });
}

if (findings.length === 0) {
  console.log(`[no-placeholders] OK - ${tracked().length} files, no substitution tokens.`);
  process.exit(0);
}

console.error(`[no-placeholders] ${findings.length} placeholder token(s) found:\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  ${f.token}`);
  console.error(`      ${f.why}`);
}
console.error(
  `\nvxtpl has no placeholders (ADR-001). Use the literal value - the product code is \`vxtpl\` -` +
    `\nand let \`scripts/init/rename-product.mjs\` rewrite it for a copied repo.`,
);
process.exit(STRICT ? 1 : 0);

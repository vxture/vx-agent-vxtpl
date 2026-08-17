import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";

// Every design token the gate spends must actually be one the design system
// defines.
//
// This exists because of how the DS 2.x -> 5.x migration broke: the semantic
// token set was renamed wholesale (`--vx-color-primary` -> `--primary`), and
// nothing failed. CSS treats an undefined custom property as a dead
// declaration, not an error, so the gate kept rendering - in default colours,
// with no build warning, no test failure, and no way to notice except looking
// at it on the right page. A stylesheet that silently stops being branded is
// exactly the failure a design system is supposed to make impossible.
//
// So the contract is checked, not assumed. The DS is reached only through its
// declared export (`@vxture/design-system/styles/globals.css`) and the import
// graph is followed from there - the same entry point the app imports, never a
// path into the package's internals.
//
// A product copied from vxtpl inherits this test, and it keeps working: it
// derives the token list from whatever CSS that product writes.

const require_ = createRequire(import.meta.url);

/** Tokens vxtpl defines for itself. Everything else must come from the DS. */
const OURS = /^--vx-gate/;

/** Read a CSS file and every file it @imports, depth-first, once each. */
function readCssGraph(entry: string, seen = new Set<string>()): string {
  const file = seen.has(entry) ? null : entry;
  if (!file) return "";
  seen.add(file);

  const css = readFileSync(file, "utf8");
  const here = dirname(file);
  let out = css;

  for (const [, spec] of css.matchAll(/@import\s+["']([^"']+)["']/g)) {
    // Relative specifiers resolve against the importing file; bare ones go
    // through Node resolution FROM THAT FILE, which is the only base that
    // works. `@vxture/design-tokens` is the DS's own dependency, not ours -
    // under pnpm it is invisible from the app, and depending on it directly to
    // make this test pass is exactly what ADR-004 rule 1 forbids.
    const next = spec.startsWith(".") ? resolvePath(here, spec) : safeResolve(spec, file);
    if (next) out += readCssGraph(next, seen);
  }
  return out;
}

function safeResolve(spec: string, importer: string): string | null {
  try {
    return createRequire(importer).resolve(spec);
  } catch {
    // A subpath the package does not export is not this test's business to
    // force - the app would have failed to build long before here.
    return null;
  }
}

function definedTokens(css: string): Set<string> {
  return new Set([...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]));
}

function tokensUsedBy(css: string): Set<string> {
  return new Set([...css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map((m) => m[1]));
}

test("every DS token the gate uses is one the design system defines", () => {
  const ds = definedTokens(readCssGraph(require_.resolve("@vxture/design-system/styles/globals.css")));
  const brand = definedTokens(readCssGraph(require_.resolve("@vxture/design-system/styles/brands/vxture.css")));
  const available = new Set([...ds, ...brand]);

  // Sanity: if the DS export ever stops carrying tokens, this test must fail
  // loudly rather than pass by finding nothing to check.
  assert.ok(available.size > 50, `expected the DS to define many tokens, found ${available.size}`);

  const gate = readFileSync(new URL("./gate.css", import.meta.url), "utf8");
  const missing = [...tokensUsedBy(gate)].filter((t) => !OURS.test(t) && !available.has(t)).sort();

  assert.deepEqual(
    missing,
    [],
    `gate.css spends tokens the design system does not define: ${missing.join(", ")}. ` +
      `Either the DS renamed them (check its CHANGELOG for the new names) or they were never real.`,
  );
});

test("the gate carries no fallback values, so a renamed token breaks visibly", () => {
  const gate = readFileSync(new URL("./gate.css", import.meta.url), "utf8");
  // `var(--x, anything)` is what made the 5.x rename survive unnoticed.
  const withFallback = [...gate.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*,/g)].map((m) => m[1]);

  assert.deepEqual(
    withFallback,
    [],
    `these tokens carry a fallback: ${withFallback.join(", ")}. A fallback turns a renamed ` +
      `token into a silent downgrade - the gate renders, unbranded, and nothing reports it.`,
  );
});

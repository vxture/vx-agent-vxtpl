import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { execSync } from "node:child_process";

// The design-system consumption contract, enforced rather than described.
//
// globals.css has said "never a local copy of brand tokens" since the DS was
// adopted, and nothing checked it. The 2.x -> 5.x migration is what that cost:
// DS 5 moved its semantic layer off the `--vx-color-*` prefix onto plain names
// (`--border`, `--radius`, `--accent`), which are the same names vxtpl's own
// legacy stylesheet had been using for its hardcoded hexes. Ours load after the
// DS, so they won - vxtpl was overriding the design system's palette on every
// surface, and the only symptom was that the product looked exactly like it did
// before adopting a design system.
//
// A comment cannot catch that. Two rules can:
//
//   1. Anything vxtpl defines for itself lives under `--vxtpl-*`. Then a DS
//      release can rename whatever it likes and never collide.
//   2. Nothing vxtpl defines may shadow a token the DS defines. This is the
//      rule that actually matters; rule 1 is how it is kept cheaply true.
//
// A product copied from vxtpl inherits both, with its own code substituted for
// `vxtpl` by the rename script.

const require_ = createRequire(import.meta.url);
const OUR_PREFIX = "--vxtpl-";

function readCssGraph(entry: string, seen = new Set<string>()): string {
  if (seen.has(entry)) return "";
  seen.add(entry);
  const css = readFileSync(entry, "utf8");
  const here = dirname(entry);
  let out = css;
  for (const [, spec] of css.matchAll(/@import\s+["']([^"']+)["']/g)) {
    const next = spec.startsWith(".") ? resolvePath(here, spec) : safeResolve(spec, entry);
    if (next) out += readCssGraph(next, seen);
  }
  return out;
}

function safeResolve(spec: string, importer: string): string | null {
  try {
    return createRequire(importer).resolve(spec);
  } catch {
    return null;
  }
}

/** Custom properties DEFINED (`--x:`), as opposed to merely used. */
function definedIn(css: string): string[] {
  return [...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]);
}

function dsTokens(): Set<string> {
  const out = new Set<string>();
  for (const entry of ["@vxture/design-system/styles/globals.css", "@vxture/design-system/styles/brands/vxture.css"]) {
    for (const t of definedIn(readCssGraph(require_.resolve(entry)))) out.add(t);
  }
  return out;
}

/**
 * vxtpl's own stylesheets - whatever they are, discovered not listed.
 *
 * The extension filter is applied here rather than as a git pathspec on
 * purpose. `git ls-files portals -- *.css` looks like a narrowing but is a
 * UNION of two pathspecs, so it returns every file under portals as well; this
 * test caught itself doing that, matching the `--x:` in its own doc comment.
 */
function ourStylesheets(): string[] {
  const repoRoot = resolvePath(import.meta.dirname, "../../..");
  return execSync("git ls-files portals", { cwd: repoRoot, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((f) => f.endsWith(".css"))
    .map((f) => resolvePath(repoRoot, f));
}

test("vxtpl defines no token that the design system also defines", () => {
  const ds = dsTokens();
  assert.ok(ds.size > 50, `expected the DS to define many tokens, found ${ds.size}`);

  const collisions: string[] = [];
  for (const file of ourStylesheets()) {
    // Our own file only - NOT its import graph, which is how the DS gets in.
    for (const t of definedIn(readFileSync(file, "utf8"))) {
      if (ds.has(t)) collisions.push(`${file.split(/[\\/]/).pop()}: ${t}`);
    }
  }

  assert.deepEqual(
    collisions.sort(),
    [],
    `these redefine a design-system token, and vxtpl loads last so vxtpl wins:\n  ${collisions.join("\n  ")}\n` +
      `Either yield the token to the DS (delete ours and consume theirs), or, if it means something ` +
      `different here, move it under ${OUR_PREFIX}.`,
  );
});

test("every name imported from the DS server entry exists at runtime", async () => {
  // The one DS defect a machine can catch, so it is caught here.
  //
  // `@vxture/design-system/server` declares MORE than it exports: its `.d.ts`
  // re-exports the whole client surface, its `.mjs` re-exports only
  // design-ui/server. So `import { Button } from "@vxture/design-system/server"`
  // type-checks with zero errors and is `undefined` when the component renders -
  // "Element type is invalid ... but got: undefined", at runtime, possibly in
  // production if the path is behind a conditional.
  //
  // tsc actively vouches for the broken import, which is what makes this worse
  // than the DS's other rough edges rather than merely equal to them. Reported
  // as vxture/vxture-platform#268.
  const runtime = new Set(Object.keys(await import("@vxture/design-system/server")));
  assert.ok(runtime.size > 10, `expected the server entry to export components, found ${runtime.size}`);

  const repoRoot = resolvePath(import.meta.dirname, "../../..");
  const sources = execSync("git ls-files portals", { cwd: repoRoot, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"));

  const phantom: string[] = [];
  for (const file of sources) {
    const src = readFileSync(resolvePath(repoRoot, file), "utf8");
    for (const [, names] of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']@vxture\/design-system\/server["']/g)) {
      for (const raw of names.split(",")) {
        // `type Foo` and `Foo as Bar` - only the imported name matters.
        const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
        if (name && !runtime.has(name)) phantom.push(`${file}: ${name}`);
      }
    }
  }

  assert.deepEqual(
    phantom.sort(),
    [],
    `these type-check but are undefined at runtime:\n  ${phantom.join("\n  ")}\n` +
      `The server entry's types promise the whole client surface; only what design-ui/server ` +
      `actually exports is real. Runtime names: ${[...runtime].sort().join(", ")}`,
  );
});

test("dark mode is keyed on the class the design system sets, not the media query", () => {
  // The DS toggles `.dark` on <html> from localStorage, defaulting to system,
  // and never reads `prefers-color-scheme` - verified: zero occurrences in its
  // entire CSS graph. A stylesheet here that used the media query instead would
  // be answering a different question, and the two disagree exactly when the OS
  // is dark: vxtpl's surfaces flip, the DS's tokens do not, and the page comes
  // out half black. This repo shipped that for one commit after the 5.x
  // migration, so it is pinned rather than remembered.
  const offenders: string[] = [];
  for (const file of ourStylesheets()) {
    const withoutComments = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    if (/@media[^{]*prefers-color-scheme/.test(withoutComments)) {
      offenders.push(file.split(/[\\/]/).pop() as string);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these switch on prefers-color-scheme: ${offenders.join(", ")}. The DS switches on \`.dark\`, ` +
      `so a media query here desynchronises the two halves of the page. Use \`.dark { ... }\`.`,
  );
});

test("every token vxtpl defines for itself is namespaced", () => {
  const stray: string[] = [];
  for (const file of ourStylesheets()) {
    for (const t of definedIn(readFileSync(file, "utf8"))) {
      // `--tw-*` is Tailwind's own runtime plumbing, written by the compiler.
      if (!t.startsWith(OUR_PREFIX) && !t.startsWith("--tw-")) {
        stray.push(`${file.split(/[\\/]/).pop()}: ${t}`);
      }
    }
  }

  assert.deepEqual(
    stray.sort(),
    [],
    `these are defined in an unnamespaced slot, so a future DS release can collide with them ` +
      `silently:\n  ${stray.join("\n  ")}\nPrefix them with ${OUR_PREFIX}.`,
  );
});

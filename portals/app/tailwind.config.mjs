import { createRequire } from "node:module";
import { dirname, sep } from "node:path";

// Where Tailwind is told to look for class names.
//
// The design system's components carry their utilities as strings inside their
// compiled bundles, and Tailwind v4 skips node_modules, so something has to
// point at them. `@source` cannot: it takes a literal path pattern, so writing
// one means hardcoding `node_modules/@vxture/...` - a dependency on the
// installer's layout and on the package's internals, which is what ADR-004
// rule 3 forbids and what a copied product would inherit.
//
// This asks instead of assuming. `require.resolve` returns wherever the package
// manager actually put the package's own declared entry point, so the path is
// derived from the exports map rather than from a guess about disk layout. It
// holds under pnpm's symlinked store, under hoisting, under a different
// installer - and if the DS moves its bundle, its exports map moves with it and
// this keeps working.
//
// design-ui is resolved THROUGH design-system rather than directly, because the
// umbrella is what pins its version (ADR-004 rule 1) and it is not a dependency
// of this app. Under pnpm it is not even visible from here - only from inside
// the umbrella, which is exactly the relationship being followed.

const require = createRequire(import.meta.url);

/** Directory holding a package's published entry point, or null if absent. */
function entryDir(specifier, from) {
  try {
    const resolve = from ? createRequire(from).resolve : require.resolve;
    return dirname(resolve(specifier));
  } catch {
    return null;
  }
}

/** The glob matcher does not accept Windows separators; this repo is developed
 *  on Windows and built on Linux, so normalise rather than assume either. */
function toGlob(dir) {
  return dir.split(sep).join("/");
}

const designSystem = entryDir("@vxture/design-system");
const designUi = designSystem ? entryDir("@vxture/design-ui", require.resolve("@vxture/design-system")) : null;

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    // Both are needed: the umbrella's own shell and auth components live in its
    // bundle, every primitive they compose lives in design-ui's.
    ...[designSystem, designUi].filter(Boolean).map((dir) => `${toGlob(dir)}/**/*.{mjs,cjs,js}`),
  ],
};

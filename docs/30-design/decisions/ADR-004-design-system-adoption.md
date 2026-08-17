# ADR-004: vxtpl consumes the Vxture design system

- **Status:** accepted
- **Date:** 2026-08-17
- **Supersedes:** the "plain CSS, no framework" note in `portals/app/app/globals.css`

## Context

vxtpl shipped its own ~400-line stylesheet with its own tokens, and said so
proudly: "Plain CSS, no framework - one less dependency in the image and one
less thing a product copied from here has to adopt."

That reasoning was sound for a repo proving a deploy chain. It stops being sound
the moment vxtpl is the build every Vxture product is copied from, because then
its stylesheet is not one repo's convenience - it is the visual starting point
of the whole fleet. A product copied from vxtpl inherited vxtpl's blues, and
diverged from the platform the moment it drew anything.

The org has a design system for exactly this. `030-design-system-consumer-trial.md`
had already worked out the consumption path and named its own precondition for a
first real pilot: a React/Next.js frontend repo, authorized to modify, with
GitHub Packages read configured, on the same branch/PR/CI discipline. vxtpl is
all four.

## The state of the DS

Adopted against `2.0.0`, the pre-split monolith, which was then the only
installable line. The three-package 5.x line published to `latest` on
2026-08-17 and vxtpl moved the same day:

| | |
|---|---|
| `@vxture/design-system` | `5.0.0` (umbrella) |
| `@vxture/design-ui` | `2.0.0`, pinned exactly by the umbrella |
| `@vxture/design-tokens` | `2.0.0`, pinned exactly by the umbrella |
| `@vxture/shared` | `1.6.0` (the umbrella requires `^1.6.0`) |

`product_240_repo-template.md` still names `^2.0.0` as a product repo's
dependency surface. That is now stale, and the standard is the place to fix it -
not this ADR.

## Decision

vxtpl depends on `@vxture/design-system` `^5.0.0` and only that. Its peers
(`tailwindcss` v4, `tailwindcss-animate`, `next-themes`, `@phosphor-icons/react`)
come with it, and Tailwind v4 runs through `@tailwindcss/postcss`.

Three details are contractual rather than stylistic:

1. **The umbrella only.** Depending on `@vxture/design-ui` or
   `@vxture/design-tokens` directly is explicitly prohibited by the release
   standard: the umbrella pins them at exact versions (`2.0.0` / `2.0.0` as of
   `5.0.0`), and bypassing it loses the runtime wiring and the version
   guarantee. Under pnpm this is enforced by the installer as well - neither is
   visible from the app, only from inside the umbrella.
2. **Globals first, then exactly one brand entry.** Two brand entries, or a
   local copy of brand tokens, is how a product ends up with a palette that is
   neither the platform's nor its own.
3. **Package specifiers only - never a path into the package.** Every reference
   is `@vxture/design-system[/subpath]`, resolved through the package's declared
   exports. A repo that reaches into `node_modules/@vxture/design-system/...`
   has taken a dependency on the package's internal layout and on the
   installer's, neither of which the package promises to keep.

## How the components became usable

Rule 3 cost vxtpl the DS's React components for as long as the only way to
generate their utilities was an `@source` naming a path inside `node_modules`.
That is no longer the only way.

`@source` is a CSS at-rule and cannot compute, but a Tailwind config is
JavaScript and can. `portals/app/tailwind.config.mjs` derives its content globs
from `require.resolve("@vxture/design-system")` - it asks the package manager
where the package's own declared entry point is, rather than asserting where it
should be. design-ui is resolved THROUGH design-system, following the umbrella's
own pin rather than adding a dependency this app is forbidden to have.

The distinction is the whole point, and it is visible in the output: the paths
that come back are pnpm store paths with content hashes in them
(`node_modules/.pnpm/@vxture+design-ui@2.0.0_@ph_343c6a91.../`). No hardcoded
path could have produced that, and none would survive the next install. Asking
does; asserting does not.

Measured: the built stylesheet goes from 59KB to 121KB and `bg-primary`,
`shadow-raised`, `h-control-lg`, `inline-flex`, `animate-spin`, `rounded-full`
and `flex-col-reverse` all appear. The gate now uses `ShellBootScreen` and
`ShellBrand`, verified in a browser: the brand renders in the DS's own Funnel
Display, the action in the DS brand blue, and the boot screen's 250ms delay
means a visitor who is already signed in never sees a verifying screen at all.

This does not close `vxture/vxture-platform#268`. Every consumer still has to
write this config, and a consumer who does not gets a grey page with no error -
the package should carry it. But it does mean vxtpl is no longer choosing
between the components and rule 3.

## What the CSS-only period cost, and why the rule held through it

That is not a preference. Tailwind v4 only generates utilities it can see in a
scanned source, and it excludes `node_modules` by default. The DS's React
components carry their utilities inside their compiled bundle, so something has
to point Tailwind at them.

Under 2.0.0 that something had to be us, with `@source` naming a path inside
`node_modules` - `@source` takes a path pattern and has no package-specifier
form (verified against tailwindcss 4.3.3: a bare `@source
"@vxture/design-system"` silently matches nothing). Adding it would have broken
rule 3, so we did not, and measured the cost: every utility
`AuthPrimaryButton` and `ShellBrand` need was absent from the built CSS.

5.0.0 moves the declaration into the package, which is the right shape - the DS
now ships `@source "../../../design-ui/src"` and `@source "../components"` in
its own `globals.css`. It still does not work from the registry, because neither
directory is published: design-ui ships `["dist","CHANGELOG.md"]`, and
design-system ships `src/styles` without `src/components`. Measured again on
5.0.0, from a clean install: `bg-primary`, `shadow-raised`, `h-control-lg`,
`inline-flex`, `animate-spin` are all still 0.

So the published package remains not self-sufficient for a consumer installing
it from the registry - the same defect, one layer deeper, and now behind a
declaration that reads as if it were handled. That is a defect in the DS, not a
decision for a product repo to work around: per CLAUDE.md, a gap like this is
fixed upstream first. It is filed as `vxture/vxture-platform#268`. Adding the
two directories to `files`, or shipping precompiled component CSS, closes it -
and then vxtpl adopts the components without a path and this section becomes
history.

The cost of holding the line is real and worth naming: the fleet's reference
product is not exercising the DS's component layer, so a regression there has no
consumer catching it. That is a worse trade than it looks only if the alternative
were free - it is not. A path into `node_modules` copied into every product repo
makes the DS's internal layout a fleet-wide contract that nobody agreed to and
one refactor breaks everywhere at once.

vxtpl's existing stylesheet is loaded after the DS and keeps the classes it
already owns. It is being migrated surface by surface, not deleted in one move -
a rewrite of every page in the same change as the adoption would make a
regression impossible to attribute.

## What the 5.x migration actually cost

Both halves were silent, which is the part worth recording.

**The semantic layer was renamed wholesale.** DS 2.x named its semantic tokens
`--vx-color-primary`, `--vx-radius-lg`, `--vx-duration-spinner`; 5.x moved them
to plain `--primary`, `--radius`, and the `--vx-*` prefix now means the raw
Tailwind primitive layer instead. Same prefix, different meaning. 19 of the 22
tokens `gate.css` spent stopped existing, and nothing failed - an undefined
custom property is a dead declaration, not an error, so the gate rendered in
default colours through a green build and a green test suite.

**vxtpl was overriding the design system.** vxtpl's own stylesheet had long
defined `--border`, `--radius`, `--accent`, `--success` for itself. Under 2.x
that collided with nothing. Under 5.x those are exactly the DS's semantic names,
and vxtpl loads last - so vxtpl won, on every surface, and the only symptom was
that adopting a design system changed how nothing looked.

The fixes are structural rather than a set of corrected values:

- Everything vxtpl defines for itself is now `--vxtpl-*`. A future DS release
  can rename whatever it likes without reaching us.
- `--border`, `--radius` and `--radius-sm` were deleted here rather than
  renamed. The DS means the same thing by them, so it should be the one that
  says what they are.
- `gate.css` carries no `var()` fallbacks. A fallback is what turned the rename
  into a downgrade instead of a break.
- Three tests enforce all of it (`design-system.test.ts`, `gate.test.ts`): no
  token vxtpl defines may shadow a DS token, everything vxtpl defines is
  namespaced, and every token the gate spends must be one the DS actually
  defines. The last one caught a real mistake during this migration - `--shadow`
  and `--shadow-sm` resolve, but they are TAILWIND defaults, not DS decisions.
  The DS's shadows are an elevation scale (`raised` / `sticky` / `overlay` /
  `dialog`), and spending a Tailwind default would have looked right while
  quietly opting the gate out of the design system.

## Consequences

- ~64 packages enter the dependency tree, 13 of them Radix primitives. The
  bundle grows; the alternative was every copied product growing its own
  divergent stylesheet instead.
- A product copied from vxtpl now inherits the platform's visual language by
  default, and re-brands by swapping one import line rather than editing colours.
- **The 5.x migration is done** (2026-08-17), and it was breaking in both the
  ways predicted and one that was not: see the section above. Pinning a major is
  what kept it a deliberate act rather than something `pnpm update` performed by
  surprise, and that remains the reason to pin `^5.0.0` now.
- **The packaging defect survived the rebuild.** 5.0.0 does self-register its
  sources - `@source "../../../design-ui/src"` and `@source "../components"` -
  but neither directory is published: design-ui ships `["dist","CHANGELOG.md"]`
  and design-system ships `src/styles` without `src/components`. Verified by
  unpacking both tarballs and by measuring the build: `bg-primary`,
  `shadow-raised`, `h-control-lg`, `inline-flex`, `animate-spin` are all absent.
  This is worse than 2.0.0's version of the problem, where the absence was at
  least visible; now there is a declaration that reads as correct and resolves
  to nothing. Reported on `vxture/vxture-platform#268`.
- Read the installed `dist/index.d.ts` for the component list, never the
  monorepo source - the two have been out of step at every version so far.
- **The umbrella cannot be imported from a server component.** `dist/index.mjs`
  is `"use client"` AND uses `export *` to re-export design-ui and
  design-tokens; Next.js rejects that combination outright ("It's currently
  unsupported to use `export *` in a client boundary"). Every server component
  that wants a DS component has to go through a local client module -
  `portals/app/app/ds.tsx` here, which re-exports by name and carries the
  reason. Also on #268.
- **Dark mode is a class, not a media query.** The DS keys dark on `.dark` on
  `<html>` and never reads `prefers-color-scheme` - zero occurrences in its
  whole CSS graph. vxtpl's stylesheet used the media query, so after the 5.x
  rename the two halves of the page disagreed whenever the OS was dark: vxtpl's
  surfaces flipped, the DS's tokens did not. Fixed by adopting `ThemeProvider`
  and `themeBootstrapScript` (which sets the class before first paint) and
  moving vxtpl's own dark block onto `.dark`. Pinned by a test.

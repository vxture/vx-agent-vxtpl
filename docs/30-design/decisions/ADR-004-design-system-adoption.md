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

## The state of the DS when this was decided

Worth recording, because it is unusual and it shaped the choice:

| | |
|---|---|
| Published to GitHub Packages | `@vxture/design-system@2.0.0` (2026-06-29) |
| Platform monorepo source | `5.0.0-alpha.0` |
| `@vxture/design-ui`, `@vxture/design-tokens` | never published |

The `5.0.0-alpha` line is a breaking rebuild - Tailwind v4 native tokens, split
into three packages - landed 2026-08-07 and still receiving fixes. No `ds-v*`
release tag exists, so it has never been published under any dist-tag.

So the only installable DS is the pre-split monolith, three majors behind the
source. That is also, precisely, what the platform's own product-repo standard
prescribes: `product_240_repo-template.md` names a product repo's dependency
surface as "`@vxture/shared` >= 1.4.0, `@vxture/design-system` ^2.0.0". The
published line is not an accident of a stale release - it is the supported one.

## Decision

vxtpl depends on `@vxture/design-system` `^2.0.0` and only that. Its peers
(`tailwindcss` v4, `tailwindcss-animate`, `next-themes`, `@phosphor-icons/react`)
come with it, and Tailwind v4 runs through `@tailwindcss/postcss`.

Three details are contractual rather than stylistic:

1. **The umbrella only.** Depending on `@vxture/design-ui` or
   `@vxture/design-tokens` directly is explicitly prohibited by the release
   standard: the umbrella pins them at exact versions, and bypassing it loses
   the runtime wiring and the version guarantee. It is also moot today - neither
   is published.
2. **Globals first, then exactly one brand entry.** Two brand entries, or a
   local copy of brand tokens, is how a product ends up with a palette that is
   neither the platform's nor its own.
3. **`@source "../node_modules/@vxture/design-system/dist"`.** Tailwind v4 only
   generates utilities it can see, and the DS components carry theirs inside
   their compiled `dist`, which Tailwind does not scan by default. Without this
   line the DS's own BEM rules still land while every utility its components put
   on the DOM (`p-6`, `flex-col-reverse`, ...) is silently absent - components
   render unstyled in a way that looks like a broken import rather than a
   missing scan path. This was measured, not assumed.

vxtpl's existing stylesheet is loaded after the DS and keeps the classes it
already owns. It is being migrated surface by surface, not deleted in one move -
a rewrite of every page in the same change as the adoption would make a
regression impossible to attribute.

## Consequences

- ~64 packages enter the dependency tree, 13 of them Radix primitives. The
  bundle grows; the alternative was every copied product growing its own
  divergent stylesheet instead.
- A product copied from vxtpl now inherits the platform's visual language by
  default, and re-brands by swapping one import line rather than editing colours.
- **A migration to 5.x is owed.** When the three-package DS publishes, this repo
  moves - the breaking part is real (Tailwind v4 native tokens, a different
  package layout). Pinning `^2.0.0` means that migration is a deliberate act
  rather than something a `pnpm update` performs by surprise.
- The `Spinner` component does not exist in 2.0.0; `AuthPrimaryButton` draws its
  own inline ring. Code written against the 5.x source's component list will not
  compile here - read the installed `dist/index.d.ts`, not the monorepo source.

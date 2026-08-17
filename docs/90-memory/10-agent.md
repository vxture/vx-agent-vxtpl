# Agent entry point

Start here if you are an AI agent working in this repo.

## What this repo is

This is `vxtpl`: a Vxture product deployed at `https://vxtpl.vxture.com` (worker02)
AND the reference build new product repos are copied from (ADR-001). Both, on
purpose - see `docs/20-specs/10-product-definition.md`.

Three things follow that will save you a wrong assumption:

- **There are no placeholders.** Every name is the literal `vxtpl` value that runs
  in production. If you find a `__SOMETHING__` token outside `docs/80-liaison/`
  (frozen historical letters), it is a bug - and CI will say so:
  `scripts/guardrails/check-no-placeholders.mjs` runs in `static-checks`. Prose
  may still NAME a token, but only as inline code, which is how ADR-001 explains
  what it removed without tripping the check it argued for.
- **A new product is a copy, not an instantiation.**
  `scripts/init/rename-product.mjs <code>` rewrites the name cascade in contents
  and in path names. `instantiate.mjs` is gone; so is the build-time substitution
  step that used to run it.
- **The exemplar zone is meant to be replaced, the rigid zone is not.** The
  boundary is in `CLAUDE.md`. Filling an exemplar slot with something real is the
  point; changing a rigid mechanism because it is inconvenient is not.

## Where authority lives

Not in this repo. The governing standards are in the platform repo
(`D:\MyWebSite\vxture`): `140-repo-governance-standard.md` (WHAT),
`product_240_repo-template.md` (product-repo design), `20-self-rectify-runbook.md`
(HOW + machine checks), `070-docs-taxonomy.md` (docs numbering). When you hit a
gap not covered by an existing standard, fix the standard in the platform repo
first, then mirror it here - do not invent a standard inside a product repo.

## Working rules

- Trunk-based: feature branch -> PR -> squash-merge -> delete branch. Never push
  `main` directly.
- The five required CI checks are a stable contract: `quality-gate` / `build` /
  `test-coverage` / `audit` / `gitleaks`. Do not rename the jobs that produce them.
- Docs: numbered = formal, unnumbered = temporary. `lint:docs-numbering --strict`
  blocks unnumbered `.md`. Domain docs use `{kind}_{domain}_{NNN}_{slug}`.
- Keep source, config, and root meta files ASCII-only.
- `docs/80-liaison/` is append-only. Letters are dated records of what was sent;
  correct a superseded claim with a NEW letter, never by editing an old one.
- Product identity comes from `BRAND.productCode`, never from `OIDC_CLIENT_ID`
  (the beta client is `vxtpl-beta`; the product code stays `vxtpl`).
- See `CLAUDE.md` (repo root) for the full working agreement,
  `docs/40-implementation/10-app-workspace.md` for how the app fits together, and
  `docs/70-workplan/00-index.md` for the batch tracker.

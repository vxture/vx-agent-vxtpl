# Agent entry point

Start here if you are an AI agent working in this repo.

## What this repo is

A Vxture product repository (or the `vxture-vxtpl` template itself). It carries the org
governance base, the platform integration contract surface, and the engineering
shell - but no product domain logic in the template. A concrete product repo is
produced by `scripts/init/instantiate.mjs <product_code>`, which replaces the
`__PRODUCT_CODE__` placeholder and derives every downstream name.

## Where authority lives

Not in this repo. The governing standards are in the platform repo
(`D:\MyWebSite\vxture`): `140-repo-governance-standard.md` (WHAT),
`product_240_repo-template.md` (template design), `20-self-rectify-runbook.md`
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
- See `CLAUDE.md` (repo root) for the full working agreement, and
  `docs/70-workplan/00-index.md` for the batch tracker.

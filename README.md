# vxture-vxtpl

A governance-first template for building a Vxture product repository. It ships
the org governance base (trunk-based branching, branch-protection ruleset,
four-layer secret hygiene, SCA hard gate, and the docs numbering system),
plus a placeholder scheme and an instantiation script that turn this skeleton
into a concrete product repo.

**Product code placeholder:** `__PRODUCT_CODE__` (matches
`^[a-z][a-z0-9_-]{0,31}$`). A single value cascades across the whole repo -
compose project/container prefixes, image name, database name/role, package
scope, OIDC clients, and secret names. `scripts/init/instantiate.mjs` replaces
the placeholder with a real product code and derives every downstream name (see
`docs/50-deployment/` bootstrap checklist).

**Package manager:** pnpm (whole-stack, owner-decided 2026-07-20). Do not
reintroduce npm workspaces.

---

## What this template is

Not a static skeleton - a runnable, verifiable reference. The end-state template
(built out across batches) authenticates users against the central accounts
service, gates them by subscription tier, and exercises the platform's three
integration channels (OIDC RP, entitlement, provisioning/usage) against real
endpoints. Every instantiated repo passes the same self-rectify runbook
acceptance gates (batches A-G).

Authority for the design lives in the platform repo, not here:

- Governance (WHAT): `140-repo-governance-standard.md`
- Template design (batches/content/parameters): `product_240_repo-template.md`
- Self-rectify runbook (HOW + per-step machine checks): `20-self-rectify-runbook.md`
- Docs numbering: `070-docs-taxonomy.md`

This repo carries thin indices under `docs/10-standards/` that point at those
org standards rather than copying their text.

---

## Build status (batches)

This repository is built incrementally. Each batch is one PR with machine-checked
acceptance. See `docs/70-workplan/` for the live tracker.

| Batch | Scope | State |
|-------|-------|-------|
| 1 (A-D) | Governance base, secret hygiene, SCA gate, docs skeleton, placeholder + instantiate script, bootstrap checklists | in progress |
| 2 | Platform integration layer (OIDC RP, C2/C3 channels) + business-face DB baseline + offline Mock verification | later |
| 3 | Online integration testing against real platform endpoints | later |
| 4 | First real product instantiation, full end-to-end | later |

Batch 1 delivers the governance shell only: no application source, no deployment
pipeline (batch E), and no business-face database (batch F) yet.

---

## Instantiating a product repo

```bash
node scripts/init/instantiate.mjs <product_code>
```

This replaces `__PRODUCT_CODE__` throughout the repo, derives the cascaded names
(compose prefix `<code>-app`/`-redis`/`-db`, image `<code>-app`, database
`vxturebiz_<code>_<env>`, role `<code>_svc`, package scope `@<code>/*`, OIDC
clients `<code>`/`<code>-beta`, secret names `<CODE>_DB_SVC_PASSWORD`, etc.),
and writes a `.env.example` skeleton. It is pure Node with zero dependencies.

Then follow the two checklists in `docs/50-deployment/`:

1. Platform-side registration (owner / platform-line actions)
2. GitHub bootstrap (create public repo, enable secret scanning + push
   protection, first-push main, run CI once, apply the ruleset - in that order)

---

## Local development

```bash
pnpm install
pnpm type-check:all
pnpm lint
pnpm lint:docs-numbering
```

A `NODE_AUTH_TOKEN` with read access to GitHub Packages must be set so
`pnpm install` can resolve the `@vxture` scope (see root `.npmrc`).

---

## Working agreement

See [CLAUDE.md](CLAUDE.md) for the full repository working agreement: branch
model, tag-triggered release flow, the five required CI checks, secret hygiene,
SCA policy, docs taxonomy, and the rigid-zone / blank-zone boundary that keeps
the template domain-neutral.

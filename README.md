# vxture-vxtpl

**vxtpl** is a deployed Vxture product and the reference build every new Vxture
product is copied from. Those are deliberately the same thing: a template nobody
runs drifts from reality, so vxtpl proves the platform integration surface by
consuming it in production at `https://vxtpl.vxture.com`.

Its product is **Emberstorm** (game mode: The 20-Second Challenge) - a
bullet-dodging reaction game whose three subscription tiers (daily quota,
personal record, global leaderboard + trend) run the platform's real quota /
entitlement machinery with real users (ADR-006,
`docs/20-specs/20-challenge-game.md`). `vxtpl` is the product code;
Emberstorm is the brand (`BRAND.displayName`).

It signs users in against the central accounts service (C1), gates them by
subscription tier (C2), receives provisioning webhooks (C3), calls **Atlas** for
model inference, and calls **Runos** for capability execution - with the same
governance base, deploy chain, and CI gates any Vxture product is held to.

**Package manager:** pnpm (whole-stack, owner-decided 2026-07-20). Do not
reintroduce npm workspaces.

---

## What you get

| Surface | What it demonstrates |
|---------|----------------------|
| `/` | THE app - a fullscreen command deck: seeded runs (daily quota spent server-side at start, scores recorded within server bounds), the tier-windowed record with pro's 30-day trend, and the anonymous global board, all as collapsible side-rail modules around the arena |
| `/gate` | The product front door: verifies access on entry, redirects a signed-in visitor straight through, and otherwise shows the one action that helps |
| `/chat` | Debug/reference: a tier-gated chat turn that mints a short-lived S2S token, calls Atlas, optionally invokes a Runos capability, and meters its own usage |
| `/status` | Debug/reference: every integration channel's live configuration state, with no secret ever leaving the server |
| `/platform-check` | Debug/reference: read-only connectivity probes against Atlas and Runos |
| `/entitlement-matrix` | Debug/reference: every tier x status combination and the gate/CTA outcome it produces, fully offline |

Under those surfaces sit the parts a product repo is actually judged on: the OIDC
relying-party flow (PKCE, single-use state, back-channel logout), the entitlement
resolver with its cache-invalidation discipline, the HMAC-verified provisioning
webhook with idempotency and sequence ordering, the usage buffer/flush pipeline,
a least-privilege database with column-level write locks, and a tag-to-production
deploy chain with a required-reviewer gate.

Authority for the design lives in the platform repo, not here:

- Governance (WHAT): `140-repo-governance-standard.md`
- Product-repo design: `product_240_repo-template.md`
- Self-rectify runbook (HOW + per-step machine checks): `20-self-rectify-runbook.md`
- Docs numbering: `070-docs-taxonomy.md`

This repo carries thin indices under `docs/10-standards/` that point at those org
standards rather than copying their text.

---

## Running it locally

```bash
pnpm install
cp .env.example .env       # then fill in what you need
pnpm dev                   # http://localhost:4000
```

A `NODE_AUTH_TOKEN` with read access to GitHub Packages must be set so
`pnpm install` can resolve the `@vxture` scope (see root `.npmrc`).

With an empty `.env` everything still runs: entitlement and chat fall back to
offline mock resolvers, and chat resolves against a local dev workspace instead
of requiring sign-in, so the whole UI is explorable with no credentials. Set
`MOCK_TIER=pro` (or any tier) to see the entitlement gating actually bite.

Those affordances are **local-dev and CI only**. Both are keyed on
`DEPLOY_STAGE`, which the image always sets: on `production` or `beta` the mock
resolvers refuse to start and chat requires a real session, so a deployed stack
can never silently serve mock entitlements or resolve a workspace nobody owns.
`.env.example` documents every variable, which ones a real Atlas or Runos call
needs, and where each secret is procured.

Gates, the same ones CI runs:

```bash
pnpm type-check:all
pnpm test
pnpm lint:docs-numbering
pnpm lint:data-design
```

---

## Creating a new product from vxtpl

```bash
git clone https://github.com/vxture/vxture-vxtpl.git vxture-<code>
cd vxture-<code>
node scripts/init/rename-product.mjs <code>        # --dry-run to preview
```

The rename script rewrites the whole name cascade - OIDC clients, compose project
and containers, image name, database and service role, workspace package scope,
secret names, the public vhost - in file contents *and* in file and directory
names, then reports what a human still has to do. It is pure Node with zero
dependencies. See `docs/40-implementation/20-creating-a-product-from-vxtpl.md`
for the full procedure, and the two checklists in `docs/50-deployment/`:

1. Platform-side registration (owner / platform-line actions)
2. GitHub bootstrap (create public repo, enable secret scanning + push
   protection, first-push main, run CI once, apply the ruleset - in that order)

---

## Working agreement

See [CLAUDE.md](CLAUDE.md) for the full repository working agreement: branch
model, tag-triggered release flow, the five required CI checks, secret hygiene,
SCA policy, docs taxonomy, and the rigid-zone / exemplar-zone boundary that says
which parts of vxtpl a copy is expected to replace.

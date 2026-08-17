# vxture-vxtpl Repository Standards

Authoritative working agreement for this repo. The goal is a clean, predictable
branch and deploy flow with no direct human writes to protected branches, and a
governance base that every product repo copied from here inherits unchanged.

## What vxtpl is

`vxtpl` is a real, deployed Vxture product (`https://vxtpl.vxture.com`, worker02)
AND the reference build every new Vxture product is copied from.
Those are one thing, not two: the only way to keep a template honest is to run it
in production, so vxtpl proves the platform integration surface by actually
consuming it - it signs users in against the central accounts service, gates them
by subscription tier, receives provisioning webhooks, calls Atlas for model
inference, and calls Runos for capability execution. What ships here is the
working shape of a Vxture product, not a diagram of one.

There are no placeholders. Every name is the concrete `vxtpl` value that runs in
production, and that is enforced rather than asked for:
`scripts/guardrails/check-no-placeholders.mjs` fails CI on any `__TOKEN__`
outside the frozen liaison letters. A new product repo is created by copying this
one and running `node scripts/init/rename-product.mjs <new_code>`, which rewrites
the name cascade below (including file and directory names) in one pass.

**Package manager: pnpm** (whole-stack, owner-decided 2026-07-20). CI cache keys,
the Dockerfile deps stage, and the osv `--lockfile=pnpm-lock.yaml` path are all
pnpm. Do not reintroduce npm workspaces.

Authority for the design lives in the platform repo (`D:\MyWebSite\vxture`), not
here: `140-repo-governance-standard.md` (WHAT), `product_240_repo-template.md`
(product-repo design), `20-self-rectify-runbook.md` (HOW + machine checks),
`070-docs-taxonomy.md` (docs numbering). When a gap is not covered by an existing
standard, fix the standard in the platform repo first, then mirror it here - do
not invent a standard inside a product repo.

## Name cascade

The product code `vxtpl` (matching `^[a-z][a-z0-9_-]{0,31}$`) determines every
downstream name in the repo. These are literals in the source, not substitutions:

| Slot | vxtpl value |
|------|-------------|
| OIDC client pair | `vxtpl` / `vxtpl-beta` |
| compose project + containers | `vxtpl` / `vxtpl-app`, `vxtpl-redis`, `vxtpl-db` |
| image | `ghcr.io/vxture/vxtpl-app` (ACR fallback mirrors it) |
| database / service role | `vxturebiz_vxtpl_prod` / `vxtpl_svc` |
| workspace package scope | `@vxtpl/*` |
| platform-side secret names | `VXTPL_DB_SVC_PASSWORD`, `VXTPL_PROVISION_WEBHOOK_SECRET`, `VXTPL_WEBHOOK_BASE_URL` |
| stack root on the deploy host | `/srv/md0/vxtpl` |
| public vhost | `vxtpl.vxture.com` (beta `beta-vxtpl.vxture.com`, reserved) |

**Ports are not in this table, and not anywhere else in the repo.** They are
allocated by the org port registry, which is the only source permitted to assign
one - a repo that restates a port becomes a second source, and the second source
is the one that goes stale. The runtime value lives where it has to: the
`APP_PUBLISH_PORT` default in `docker-compose.yml` / `deploy.sh` and the edge
vhost's `$upstream`. Those are configuration, not documentation. If you need to
know vxtpl's number, read the registry, not this file.

`BRAND.productCode` (`portals/packages/shared/src/brand.ts`) is the single source
of product identity in application code. Never derive the product code from
`OIDC_CLIENT_ID`: the beta client is `vxtpl-beta` while the product code stays
`vxtpl`, so the two diverge on any non-prod stack.

`scripts/init/rename-product.mjs` is the only supported way to re-derive this
cascade for a copied repo; it is site-aware (DB and role names take the snake_case
form, secret names the upper form) and renames paths as well as file contents.

## Branch model

Single long-lived branch: `main` (trunk-based). Deploys are NOT tied to merges -
they are triggered only by pushing a release tag:

- `main` - the only integration branch. All feature work merges here via PR.
  Merging to `main` does NOT deploy anything by itself.
- `vX.Y.Z` tag - deploys the production stack. Gated by a required reviewer on
  the `production` GitHub Environment - the deploy job pauses until approved.

vxtpl runs **prod-only** (ADR-002): there is no beta stack, no `beta` GitHub
Environment, and `deploy.yml` rejects any tag that is not `v*.*.*`. The
`vxtpl-beta` OIDC client stays reserved but unused. A product copied from vxtpl
that wants two tiers adds the beta routing and a beta compose project itself.

`dev-*` and `varda-*` tags are platform-repo-only; product repos do not build
develop/varda environments.

Always branch off `origin/main`, never off a stale local branch.

## How to make a change (the only path)

1. `git fetch origin && git switch -c <feature> origin/main`
2. Commit work on the feature branch.
3. Open a PR into `main`. Direct `git push origin main` is BLOCKED by the ruleset
   (must go through a PR, and the required checks must pass).
4. CI runs on the PR. Squash-merge once green; the branch is auto-deleted on
   merge. This does not deploy anything.
5. When ready to release, cut a tag from the commit you want deployed and push it.

Squash merge only (merge commits and rebase merges are disabled) to keep a linear
history.

### Bootstrap order (empty repo)

The branch-protection ruleset is applied LAST, not first: `git init` -> establish
`main` -> first-push `main` and let CI produce the required checks once -> THEN
apply `main-ruleset.json`. Applying a restrictive ruleset before the first code
import would block that import.

## Branch protection (GitHub Rulesets, not legacy protection)

Enforced via repo Rulesets (`gh api repos/vxture/<repo>/rulesets`). Legacy
`branches/*/protection` returns 404 - do not look there. The authoritative
ruleset is `docs/50-deployment/rebuild/main-ruleset.json`:

- `main` (single ruleset): require PR (0 approvals - checks gate merges, not human
  review), require the five status checks below (strict / up-to-date with base),
  block deletion, block non-fast-forward, require linear history, squash-only.
- `production` GitHub Environment: required reviewer - every `v*.*.*` tag deploy
  pauses here until approved. It is the only environment (ADR-002).

**Required checks (authoritative set of five):** `quality-gate` / `build` /
`test-coverage` / `audit` / `gitleaks`. CI job names must produce exactly these
five contexts - renaming a job breaks branch protection. Never remove a check
from the required set.

## CI/CD pipeline

`ci.yml` triggers on PRs to `main` and on `push:main` (the squash commit that
lands on main is a new SHA, so it gets its own gate run); it does NOT deploy.

- `quality-gate` aggregates the static checks: `git diff --check` and the docs
  numbering guardrail (`node scripts/guardrails/check-docs-numbering.mjs --strict`).
- `build`: installs the pnpm workspace with a frozen lockfile, type-checks, and
  produces the Next.js standalone build. Also its own required check.
- `test-coverage`: runs the app's `node:test` suite.
- `audit` (separate required check): `osv-scanner` (pinned binary) scans
  `pnpm-lock.yaml` for known dependency vulnerabilities, hard-blocking on any new
  finding, with `--config .osv-scanner.toml`. Exceptions are recorded per
  package-version in `.osv-scanner.toml` with a reason - never suppressed by
  removing the check.
- `gitleaks` (separate required check, `.github/workflows/secret-scan.yml`):
  pinned gitleaks binary, full-history `detect`, rules in `.gitleaks.toml`.

None of these run on a tag push - cutting a release tag ships whatever is already
at that commit on `main`, it does not re-verify the gates.

The deploy chain is `deploy.yml` (tag -> production Environment -> approval) ->
`build.yml` (reusable; GHCR primary + ACR fallback, dedup by `sha-<short>` tag) ->
`deploy/deploy.sh` over the tailnet (`tailnet-ssh-connect` composite action).
`rollback.yml` re-points the app container at a previously built image, and
`db-init.yml` is the only path that touches DB structure. The product code is a
literal in these files - there is no build-time substitution step.

## Secret hygiene (four layers)

Credentials never enter the repo - only environment/config injection. Leaks are
revoked at the source console, not scrubbed from history. Dev-phase repos are
PUBLIC (no private fallback), so "credentials never committed" is an absolute
rule, not a posture backed by a private boundary.

1. GitHub secret scanning + push protection (repo setting) - blocks on push. On a
   public repo these are free and fully enabled (a private repo would need GHAS),
   so this layer is actually stronger here.
2. `gitleaks` CI (`.github/workflows/secret-scan.yml`) - CI layer 2.
3. Local `.husky/pre-commit` - wire once per clone with
   `git config core.hooksPath .husky` (and install gitleaks locally, e.g.
   `scoop install gitleaks`). Missing binary warns and passes, never blocks.
4. Public posture, all-rights-reserved. A public repo defaults to
   all-rights-reserved; ship NO LICENSE file and NO `license` field / `@license`
   marker - a stray open-source marker would actually grant rights (public != open
   source). `package.json` keeps `"private": true` as an npm-publish guard, which
   is unrelated to GitHub repo visibility.

Shared credentials (ACR, tailscale, npm token) are org-level: configured once and
shared to selected repos, not duplicated per repo.

## Dependency security (SCA)

`audit` = osv-scanner hard gate over `pnpm-lock.yaml`. Fix (upgrade / pnpm
override / exact pin for peer-only deps) or record a named `[[PackageOverrides]]`
exception with a reason - never widen the gate (no `continue-on-error`, never
removed from required). vxtpl ships an empty ignore baseline, and a product
copied from it starts empty too; do not copy another repo's named ignores.

## Docs taxonomy

`docs/` follows the org docs taxonomy (`070-docs-taxonomy.md`): top-level decades
`00-meta` / `10-standards` / `20-specs` / `30-design` / `40-implementation` /
`50-deployment` / `60-operations` / `70-workplan` / `80-liaison` / `90-memory`;
map in `docs/00-meta/00-index.md`. Numbered = formal, unnumbered = temporary
(delete or number it), enforced by the docs numbering guardrail. Domain documents
use the strict underscore family `{kind}_{domain}_{NNN}_{slug}` (`kind` in
data/design/ops) - this repo's `check-docs-numbering.mjs` is tightened from the
platform version and does NOT accept the arda hyphen variant. ADRs live in
`docs/30-design/decisions/` with stable append-only IDs; the tech-debt register
lives in `docs/60-operations/` (`TD-NNN`).

## Rigid zone / exemplar zone

**Rigid (do not deviate, here or in any copy):** the entire governance base;
CI/CD key names, job names, workflow semantics; the three-channel module
endpoints/signing/idempotency/gating formula/cache discipline; value-domain
consumption; DB governance (DDL three-part + column locks + db-init as the sole
structure-change path); docs numbering; the data-face hard constraints.

**Exemplar (concrete vxtpl content a copy is expected to replace):** the product
surfaces under `portals/app/app/` and their components; the domain schemas beyond
the three reserved contract schemas (`vx_provision` / `local_authz` /
`local_usage` are reserved names and must not be reused for domain data);
role/permission catalog values; the contents of the capability matrix
(`portals/app/app/entitlement/capability.ts`) and the model/skill catalog; the
`20-specs/` product definition; domain guardrails.

The distinction is mechanism versus content. vxtpl fills every exemplar slot with
something real and working, so a copy has a worked example to edit rather than an
empty file to guess at - but it edits the content and leaves the mechanism alone.

## Repository hygiene

- Keep the working tree clean; do not commit local runtime artifacts (`.env`,
  generated data, certs, caches) - they are git-ignored on purpose.
- After a merge, prune stale remotes: `git fetch --prune`.
- Squash merges make `git branch -d` report merged branches as "not fully merged";
  use `-D` after confirming the PR is MERGED via `gh pr view`.
- Keep source, config, and root meta files (`.gitignore`, `.editorconfig`,
  `.gitattributes`, `.npmrc`, `.gitleaks.toml`, `CLAUDE.md`, `README.md`)
  ASCII-only - no em-dashes, smart quotes, or non-ASCII characters.

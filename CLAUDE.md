# vxture-vxtpl Repository Standards

Authoritative working agreement for this repo. The goal is a clean, predictable
branch and deploy flow with no direct human writes to protected branches, and a
governance base that every instantiated product repo inherits unchanged.

This is the Vxture product-repo template. It is domain-neutral by design: it
carries the org governance base, the platform integration contract surface, and
the engineering shell, but no product domain logic. A concrete product repo is
produced by running `scripts/init/instantiate.mjs <product_code>`, which replaces
the `__PRODUCT_CODE__` placeholder and derives every downstream name.

**Package manager: pnpm** (whole-stack, owner-decided 2026-07-20). CI cache keys,
the Dockerfile deps stage, and the osv `--lockfile=pnpm-lock.yaml` path are all
pnpm. Do not reintroduce npm workspaces.

Authority for the design lives in the platform repo (`D:\MyWebSite\vxture`), not
here: `140-repo-governance-standard.md` (WHAT), `product_240_repo-template.md`
(template design), `20-self-rectify-runbook.md` (HOW + machine checks),
`070-docs-taxonomy.md` (docs numbering). When a gap is not covered by an existing
standard, fix the standard in the platform repo first, then mirror it here - do
not invent a standard inside the template.

## Placeholder cascade

`__PRODUCT_CODE__` (matches `^[a-z][a-z0-9_-]{0,31}$`) is defined once and cascades
across the whole repo. `scripts/init/instantiate.mjs` replaces it and derives:
OIDC client pair (`<code>` / `<code>-beta`), compose project/container prefix
(`<code>-app` / `-redis` / `-db`), image name `<code>-app`, database name and role
(`vxturebiz_<code>_<env>` / `<code>_svc`), workspace package scope `@<code>/*`,
secret names (`<CODE>_DB_SVC_PASSWORD`, `<CODE>_PROVISION_WEBHOOK_SECRET`,
`<CODE>_WEBHOOK_BASE_URL`), and deploy-contract sentinels. Batch 1 only plants the
placeholder; later batches consume the derived names.

## Build status (batches)

This repository is built incrementally; each batch is one PR with machine-checked
acceptance (`docs/70-workplan/`). Batch 1 (A-D) delivers the governance shell:
root files + branch protection, secret hygiene, SCA gate, docs skeleton, the
placeholder + instantiate script, and two bootstrap checklists. It does NOT
include application source, the deploy pipeline (batch E), or the business-face
database (batch F). Sections below describing the tag-to-env CD model and the
app runtime state the intended standard the template grows into; the concrete
workflow files land in later batches.

## Branch model

Single long-lived branch: `main` (trunk-based). Deploys are NOT tied to merges -
they are triggered only by pushing a release tag, which also selects the
environment (product repos default to two tiers):

- `main` - the only integration branch. All feature work merges here via PR.
  Merging to `main` does NOT deploy anything by itself.
- `beta-YYYYMMDD.N` tag - deploys the beta stack. No approval gate.
- `vX.Y.Z` tag - deploys the production stack. Gated by a required reviewer on
  the `production` GitHub Environment - the deploy job pauses until approved.

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
  pauses here until approved.
- `beta` GitHub Environment: no reviewer gate.

**Required checks (authoritative set of five):** `quality-gate` / `build` /
`test-coverage` / `audit` / `gitleaks`. CI job names must produce exactly these
five contexts - renaming a job breaks branch protection. A skeleton repo with no
unit tests still provides a permanently-green `test-coverage` job (it occupies the
context; zero tests passes). Never remove a check from the required set.

## CI/CD pipeline

`ci.yml` triggers on PRs to `main` and on `push:main` (the squash commit that
lands on main is a new SHA, so it gets its own gate run); it does NOT deploy.

- `quality-gate` aggregates the static checks: `git diff --check` and the docs
  numbering guardrail (`node scripts/guardrails/check-docs-numbering.mjs --strict`).
- `build`: type-check and production build. In the skeleton (no app yet) this is a
  placeholder step (`echo "skeleton: no app yet"`); batch 2 replaces it with a
  real build. Also its own required check.
- `test-coverage`: permanently-green no-op in the skeleton; occupies the required
  context until real tests exist.
- `audit` (separate required check): `osv-scanner` (pinned binary) scans
  `pnpm-lock.yaml` for known dependency vulnerabilities, hard-blocking on any new
  finding, with `--config .osv-scanner.toml`. Exceptions are recorded per
  package-version in `.osv-scanner.toml` with a reason - never suppressed by
  removing the check.
- `gitleaks` (separate required check, `.github/workflows/secret-scan.yml`):
  pinned gitleaks binary, full-history `detect`, rules in `.gitleaks.toml`.

None of these run on a tag push - cutting a release tag ships whatever is already
at that commit on `main`, it does not re-verify the gates.

The tag-to-env deploy workflows (`deploy.yml`/`build.yml`/`rollback.yml`/
`db-init.yml`) and the `tailnet-ssh-connect` composite action are batch E and are
not present in batch 1.

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
removed from required). The template ships an empty ignore baseline; do not copy
another repo's named ignores.

## Docs taxonomy

`docs/` follows the org docs taxonomy (`070-docs-taxonomy.md`): top-level decades
`00-meta` / `10-standards` / `20-specs` / `30-design` / `40-implementation` /
`50-deployment` / `60-operations` / `70-workplan` / `80-liaison` / `90-memory`;
map in `docs/00-meta/00-index.md`. Numbered = formal, unnumbered = temporary
(delete or number it), enforced by the docs numbering guardrail. Domain documents
use the strict underscore family `{kind}_{domain}_{NNN}_{slug}` (`kind` in
data/design/ops) - the template's `check-docs-numbering.mjs` is tightened from the
platform version and does NOT accept the arda hyphen variant. ADRs live in
`docs/30-design/decisions/` with stable append-only IDs; the tech-debt register
lives in `docs/60-operations/` (`TD-NNN`).

## Rigid zone / blank zone

**Rigid (do not deviate):** the entire governance base; CI/CD key names, job
names, workflow semantics; the three-channel module endpoints/signing/idempotency/
gating formula/cache discipline; value-domain consumption; DB governance (DDL
three-part + column locks + db-init as the sole structure-change path); docs
numbering; the data-face hard constraints.

**Blank (each product decides, template gives an empty slot only):** domain pages
and components; the N product domain schemas (naming/count product-decided; the
`vx_provision` / `local_authz` / `local_usage` names are reserved); role/permission
catalog values; the content of the capability matrix and billing model (format is
reference only); `20-specs/` product definition; domain guardrails.

## Repository hygiene

- Keep the working tree clean; do not commit local runtime artifacts (`.env`,
  generated data, certs, caches) - they are git-ignored on purpose.
- After a merge, prune stale remotes: `git fetch --prune`.
- Squash merges make `git branch -d` report merged branches as "not fully merged";
  use `-D` after confirming the PR is MERGED via `gh pr view`.
- Keep source, config, and root meta files (`.gitignore`, `.editorconfig`,
  `.gitattributes`, `.npmrc`, `.gitleaks.toml`, `CLAUDE.md`, `README.md`)
  ASCII-only - no em-dashes, smart quotes, or non-ASCII characters.

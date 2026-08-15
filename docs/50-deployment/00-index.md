# 50-deployment - Infra, CI/CD, environments, bootstrap

Deployment and bootstrap material for this repo.

| File / dir | Purpose |
|------------|---------|
| `10-platform-registration-checklist.md` | platform-side registration a product needs before any real call succeeds |
| `20-github-bootstrap-checklist.md` | one-time GitHub bootstrap: create public repo, enable scanning, first-push main, run CI once, apply the ruleset (in that order) |
| `rebuild/` | rebuild artifacts; holds `main-ruleset.json` (the branch-protection ruleset) |

## The deploy chain

Pushing a `vX.Y.Z` tag runs `deploy.yml`, which routes to the `production` GitHub
Environment (required reviewer, so the job pauses), calls the reusable
`build.yml` to publish `ghcr.io/vxture/vxtpl-app:sha-<short>` with an Aliyun ACR
mirror, then joins the tailnet via the `tailnet-ssh-connect` action and runs
`deploy/deploy.sh` on worker02. `rollback.yml` re-points the app container at a
previously built image; `db-init.yml` is the only path that touches DB structure.

Two properties are worth knowing before reading those files:

- **CI does not run on a tag.** Cutting a release ships whatever is already on
  `main` at that commit; it does not re-verify the gates.
- **The product code is a literal.** There is no build-time substitution and no
  `PRODUCT_CODE` repo variable in the path - the deployed image is built from the
  repository as it stands.

vxtpl is production-only (ADR-002): there is no beta environment and `deploy.yml`
rejects any tag that is not `v*.*.*`.

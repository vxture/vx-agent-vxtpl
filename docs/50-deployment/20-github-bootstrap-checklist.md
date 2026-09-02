# GitHub bootstrap checklist

One-time GitHub setup for a Vxture product repo. Code-external, owner action.
Authority: `140-repo-governance-standard.md` section 1 / section 6 and
`product_240_repo-template.md` section 2.8.

For vxtpl the boxes below are already ticked; a product copied from vxtpl works
this list from the top.

## Repo and branch protection

- [ ] Create the repo PUBLIC (dev-phase repos are public; 140 section 2). A public
      repo defaults to all-rights-reserved - ship no LICENSE file and no `license`
      field (public != open source); clean any stray open-source marker.
- [ ] Enable GitHub secret scanning + push protection (repo Settings) - free and
      fully available on a public repo, and the primary defense now that there is
      no private fallback.
- [ ] ORDER MATTERS (empty repo): first-push `main` and let CI run once so the
      required checks are produced, THEN apply the ruleset. Applying a restrictive
      ruleset before the first import blocks that import.
  - [ ] `git push -u origin main` (establishes `main`, triggers first CI run).
  - [ ] Confirm the five checks appear and go green: `quality-gate` / `build` /
        `test-coverage` / `audit` / `gitleaks`.
  - [ ] Apply the ruleset:
        `gh api repos/vxture/<repo>/rulesets --method POST --input docs/50-deployment/rebuild/main-ruleset.json`
  - [ ] Verify: `gh api repos/vxture/<repo>/rulesets` shows a branch ruleset whose
        required checks include the five contexts.
- [ ] `NODE_AUTH_TOKEN` with read access to GitHub Packages, so CI can resolve
      `@vxture/*`. The `build` and `test-coverage` jobs both need it.
- [ ] `VXTURE_PACKAGES_READ_TOKEN` as a **Dependabot** secret (Settings ->
      Secrets and variables -> **Dependabot**, not Actions - they are separate
      namespaces and neither can see the other). A **classic** PAT with
      `read:packages` and nothing else; the GitHub Packages npm registry does
      not accept fine-grained tokens.

      Without it the entire npm half of Dependabot fails permanently and
      quietly: `pnpm update --lockfile-only` re-resolves `@vxture/*`, gets a
      401, and every dependency ends in
      `private_source_authentication_failure`. Nothing is reported as broken -
      the repo simply never receives an npm update PR again.

      **Verify rather than assume.** After adding it, run "Check for updates" on
      the npm entry (Insights -> Dependency graph -> Dependabot) and confirm the
      job log has no `ERR_PNPM_FETCH_401`. A repo where `github-actions`
      produces PRs and `npm` produces none is showing you this failure.

## Deployment - prod only on worker02

vxtpl deploys **production only** (ADR-002) on **worker02** (in the tailnet,
non-VPC, so GHCR primary + ACR fallback), stack root `/srv/md0/vxtpl` on the data
array. The workflows (`deploy` / `build` / `rollback` / `db-init` plus the
`tailnet-ssh-connect` action) are in the repo, and the product code is a literal
in them - there is no build-time substitution step and no `PRODUCT_CODE` repo
variable in the path any more.

### Configured for vxtpl

- [ ] `APP_PUBLISH_PORT` in the host `.env`, set to vxtpl's allocation from the
      port registry (the repo does not restate the number - see CLAUDE.md). It is
      one number: the app listens on it and is published on it. No workflow reads
      the repo variable. **Pending: the registry has reassigned vxtpl and the
      cutover is not executed** - the host `.env` and the edge vhost move in the
      same window, or the site 502s the way it did in liaison letter 50.
- [x] `production` GitHub Environment + required reviewer (deploy pauses until
      approved). No `beta` environment - prod only.
- [x] Non-secret host secrets: `DEPLOY_HOST` = `vx-worker-02` (tailnet MagicDNS,
      IP `100.76.219.48`), `DEPLOY_USER` = `stone`, `DEPLOY_PORT` = `22`.
- [x] Domain `vxtpl.vxture.com` created and resolving (shared edge -> worker02
      over the tailnet); vhost source in `configs/edge/`.
- [x] Org-level shared credentials available to the repo: `NODE_AUTH_TOKEN`,
      `ALIYUN_ACR_USERNAME/PASSWORD`, `TAILSCALE_OAUTH_*`; org vars
      `ALIYUN_ACR_REGISTRY/NAMESPACE`, `VXTURE_NPM_REGISTRY`,
      `TAILSCALE_OAUTH_CLIENT_TAG`.

### Still required from the owner (secret values an agent cannot obtain)

- [ ] `DEPLOY_SSH_KEY` - a private key authorized on `vx-worker-02` for `stone`
      (plus optional `DEPLOY_SSH_KEY_PASSPHRASE`).
- [ ] `DEPLOY_KNOWN_HOSTS` - `ssh-keyscan -p 22 vx-worker-02` from a trusted
      network. Fail-closed; there is no TOFU fallback.
- [ ] `ENV_FILE_BASE64` - base64 of the host `.env`. Start from the committed
      `.env.example`, which is the authoritative key list. It is written to
      `/srv/md0/vxtpl/etc/.env` only when that file is ABSENT, so re-cutting this
      secret does not update a running host - drift is silent until a rebuild.
- [ ] SSH `vx-worker-02` once: create `/srv/md0/vxtpl`, confirm GHCR/ACR login.
- [ ] `OIDC_CLIENT_SECRET` in the host `.env`. This one credential unlocks both
      login and all S2S calls (ADR-003).
- [ ] `ATLAS_API_URL` and `RUNOS_API_URL` in the host `.env` - base URLs only,
      no tokens. Without them chat falls back to a mock (which a deployed stage
      refuses unless `ALLOW_MOCK_ON_DEPLOY=on`) and skills report unavailable.
- [ ] Release: `git tag vX.Y.Z && git push origin vX.Y.Z`, then approve the
      pending `production` deployment. DB structure changes go through
      `db-init.yml` (`confirm=yes` + `expected_sha`), never the deploy chain.
- [ ] After a release that ADDS a `deploy/database/ddl/incr/` file, run
      `db-init.yml` and read the log: it must print one `applying incr <file>`
      line per increment and end with the resulting table list. The job ships
      the DDL from the pinned commit and fails if the counts disagree, so a
      green run now means the increments really landed - which the 2026-09-01
      run did not (it applied the host's stale copy, silently applied nothing,
      and left the challenge schema missing in production).

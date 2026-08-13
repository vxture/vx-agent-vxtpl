# GitHub bootstrap checklist

One-time GitHub setup for a product repo instantiated from this template.
Code-external, owner action. Authority: `140-repo-governance-standard.md`
section 1 / section 6 and `product_240_repo-template.md` section 2.8.

## Batch 1 (governance shell) - do these now

- [ ] Create the repo PUBLIC (dev-phase repos are public; 140 section 2). A
      public repo defaults to all-rights-reserved - ship no LICENSE file and no
      `license` field (public != open source); clean any stray open-source marker.
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
- [ ] If CI needs to resolve `@vxture/*` packages, provide read access via
      `NODE_AUTH_TOKEN` / the `@vxture` registry; otherwise skip (batch 1 has no
      published-package dependency to resolve).

Batch 1 does NOT need deploy Environments or `DEPLOY_*` secrets - those are
batch E.

## Batch E (deployment) - PROD ONLY on worker02

This template deploys **production only** (owner decision) on **worker02** (in
the tailnet, non-VPC -> GHCR primary + ACR fallback), stack root
`/srv/md0/<code>` (data array). The workflows (`deploy`/`build`/`rollback`/
`db-init` + the `tailnet-ssh-connect` action) are in the repo. The deploy layer
reads the product code from the `PRODUCT_CODE` repo variable (falling back to the
`__PRODUCT_CODE__` literal an instantiated product repo has replaced), so the
template deploys as its demo code without in-place instantiation.

### Demo product allocation (vxtpl) - configured

- [x] `PRODUCT_CODE` repo variable = `vxtpl`; `APP_PUBLISH_PORT` = `3210`
      (reassigned from `3232` 2026-07-24; see
      `docs/80-liaison/40-2607241900-vxtpl-port-reassignment.md`).
- [x] `production` GitHub Environment + Required reviewer (deploy pauses until
      approved). No `beta` (prod only).
- [x] Non-secret host secrets set from the arda repo's worker02 info:
      `DEPLOY_HOST` = `vx-worker-02` (tailnet MagicDNS; IP `100.76.219.48`),
      `DEPLOY_USER` = `stone`, `DEPLOY_PORT` = `22`.
- [x] Domain `vxtpl.vxture.com` created and resolving (shared edge ->
      `vx-worker-02:3210`).
- [x] Org-level shared credentials available to the repo: `NODE_AUTH_TOKEN`,
      `ALIYUN_ACR_USERNAME/PASSWORD`, `TAILSCALE_OAUTH_*`; org vars
      `ALIYUN_ACR_REGISTRY/NAMESPACE`, `VXTURE_NPM_REGISTRY`,
      `TAILSCALE_OAUTH_CLIENT_TAG`.

### Still required from the owner (secret values the agent cannot obtain)

- [ ] `DEPLOY_SSH_KEY` - a private key authorized on `vx-worker-02` for `stone`
      (+ optional `DEPLOY_KEY_PASSPHRASE`).
- [ ] `DEPLOY_KNOWN_HOSTS` - `ssh-keyscan -p 22 vx-worker-02` from a trusted
      network (fail-closed; no TOFU).
- [ ] `ENV_FILE_BASE64` - base64 of the vxtpl `.env` (domain `vxtpl.vxture.com`,
      DB `vxturebiz_vxtpl_prod` / role `vxtpl_svc`, plus the OIDC/webhook/job
      secrets). Generate the skeleton with
      `node scripts/init/instantiate.mjs vxtpl --dry-run`.
- [ ] SSH `vx-worker-02` once: create `/srv/md0/vxtpl`, confirm GHCR/ACR login.
- [ ] `ATLAS_API_URL` + `ATLAS_S2S_TOKEN` (optional - chat capability
      verification ships with an offline Mock resolver either way; see
      `docs/80-liaison/60-2608130300-vxtpl-atlas-chat-request.md` for the
      pending platform-line scope decision + credential request).
- [ ] `RUNOS_API_URL` + `RUNOS_S2S_TOKEN` (optional - `/platform-check`
      reports Runos as "not configured" either way; see
      `docs/80-liaison/70-2608131500-vxtpl-runos-capability-check-request.md`).
- [ ] Release: `git tag vX.Y.Z && git push origin vX.Y.Z` -> approve the pending
      `production` deployment. DB structure via `db-init.yml` (`confirm=yes` +
      `expected_sha`), never the deploy chain.
- [ ] Release: `git tag vX.Y.Z && git push origin vX.Y.Z` -> approve the pending
      `production` deployment. DB structure changes go through `db-init.yml`
      (`confirm=yes` + `expected_sha`), never the deploy chain.

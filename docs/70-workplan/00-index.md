# 70-workplan - Build plan and batch tracker

This repo is built incrementally from `vxture-vxtpl`. Each batch is one PR with
machine-checked acceptance (self-rectify runbook batches A-G). Authority for the
plan: platform repo `docs/30-design/product_240_repo-template.md` section 7.

## Batch 1 (governance shell) - runbook batches A-D

| Batch | Scope | Acceptance | State |
|-------|-------|-----------|-------|
| A | Root files + branch-protection ruleset | first-push succeeds; `git diff --check` clean | done |
| B | Four-layer secret hygiene (gitleaks) | `gitleaks detect` full history 0 hits; CI `gitleaks` green | done |
| C | SCA hard gate (osv-scanner) | `osv-scanner scan -L pnpm-lock.yaml --config .osv-scanner.toml` -> No issues found; CI `audit` green | done |
| D | Docs skeleton + CI aggregate + package.json + instantiate script + checklists | `check-docs-numbering.mjs --strict` exit 0; `pnpm type-check:all` passes; CI five jobs green | done |
| A (finish) | Apply `main-ruleset.json` | `gh api repos/vxture/<repo>/rulesets` has a branch ruleset with the five required contexts | done (ruleset id 19214235, active) |

Batch 1 done = runbook batches A-D machine-checks all green + ruleset applied.
**Batch 1 is COMPLETE**: all five required checks (`quality-gate` / `build` /
`test-coverage` / `audit` / `gitleaks`) green on `main`, ruleset active, repo
public with secret scanning + push protection enabled.

## Batch 2 (platform integration + DB baseline) - COMPLETE

Offline Mock-green. Each sub-batch was one PR (squash-merged).

| Sub-batch | Scope | State |
|-----------|-------|-------|
| 2a | App-profile scaffold (Next.js standalone, `@product-code/*` workspace, Dockerfile, compose, real CI build) | done (#2) |
| 2b | C1 OIDC RP - five `/auth/*` endpoints, RS256-only, `__Host-` cookie, Redis session, roles gate (guards arda #27/#28) | done (#3) |
| 2c | C2 entitlement - envelope v3, gating/CTA, resolver + Mock + 45s cache, quota, capability mechanism, deep-link | done (#4) |
| 2d | C3 - provisioning webhook (HMAC/idempotency/seq) + usage buffer/flush (409-terminal); persistence port + in-memory | done (#5) |
| 2e | Business-face DB baseline - DDL three-part (vx_provision/local_authz/local_usage) + service role + column locks + Prisma lockstep guardrail | done (#6) |
| 2f | Offline verification pages - tier x status gating matrix + channel-status probe | done (#7) |
| 2g | `.env.example` completed with the platform-integration keys; batch-2 finalize | done (#8) |

Deferred to later batches: the Prisma-backed runtime stores (need a live DB ->
batch 3), the `@vxture/shared` value-domain dependency (needs CI `NODE_AUTH_TOKEN`
-> TD-001), S2S / tool-protocol / agent-server (agent profile, pre-decisions
pending), and the deploy pipeline (batch E).

## Later batches

| Batch | Scope |
|-------|-------|
| 3 | Online integration testing against real platform endpoints; agent-profile increment per its three pre-decisions |
| 4 | First real product instantiation, full end-to-end |
| E | Deploy pipeline - **authored and infra-verified**: `deploy`/`build`/`db-init` workflows + `tailnet-ssh-connect` + `deploy.sh` exercised end-to-end against the `vxtpl` demo instantiation on worker02 (`/srv/md0/vxtpl`), GHCR primary + ACR fallback. Four real production tag deploys (v0.1.0-v0.1.3) plus a gated `db-init apply` all succeeded; `vxtpl.vxture.com` serves the live app with the business-face DB connected. `rollback.yml` remains unexercised (no rollback has been needed). |

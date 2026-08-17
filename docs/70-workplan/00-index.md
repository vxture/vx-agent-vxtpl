# 70-workplan - Build plan and batch tracker

vxtpl is built incrementally. Each batch is one PR with machine-checked
acceptance (self-rectify runbook batches A-G). Authority for the plan: platform
repo `docs/30-design/product_240_repo-template.md` section 7.

Batch rows below are dated records of what was built and accepted. They are
vxtpl's history: a repo copied from vxtpl deletes this tracker and starts its own
rather than inheriting one.

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
| 2a | App-profile scaffold (Next.js standalone, `@vxtpl/*` workspace, Dockerfile, compose, real CI build) | done (#2) |
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
| 3 | Online integration against real platform endpoints - the open frontier. Code-side work landed in batch F; what remains is platform-side registration (see `docs/50-deployment/10-platform-registration-checklist.md`) and a first verified live call |
| 4 | First product created by copying vxtpl and running `rename-product.mjs`, full end-to-end |
| E | Deploy pipeline - **authored and infra-verified**: `deploy`/`build`/`db-init` workflows + `tailnet-ssh-connect` + `deploy.sh` exercised end-to-end against the `vxtpl` demo instantiation on worker02 (`/srv/md0/vxtpl`), GHCR primary + ACR fallback. Four real production tag deploys (v0.1.0-v0.1.3) plus a gated `db-init apply` all succeeded; `vxtpl.vxture.com` serves the live app with the business-face DB connected. `rollback.yml` remains unexercised (no rollback has been needed). |

## Batch F (product-grade exemplar) - COMPLETE

One PR. Repositions vxtpl from a placeholder skeleton to a deployed product that
is also the reference build (ADR-001), and closes the integration gaps that made
"really calls Atlas and Runos" untrue.

| Item | Scope | State |
|------|-------|-------|
| F1 | Placeholder removal - `__PRODUCT_CODE__` family baked to literals across workflows, compose, DDL, edge vhost (renamed to `vxtpl.vxture.com.conf` with its real port), app source; `instantiate.mjs` and the build-time substitution step deleted | done |
| F2 | `rename-product.mjs` - site-aware copy-and-rename (raw/snake/upper), renames paths as well as contents, refuses to rewrite vxtpl's own history | done |
| F3 | S2S token exchange (ADR-003) - per-call minting with identity-keyed cache; `ATLAS_S2S_TOKEN` / `RUNOS_S2S_TOKEN` removed | done |
| F4 | Runos MCP client - real `discover`/`resolve`/`invoke`/`report_outcome` over `POST /v1/mcp`, wired to chat skill selection; fixed a well-known probe that read a field Runos never emits | done |
| F5 | Session-bound `/api/chat` - entitlement, S2S identity and Atlas attribution all follow the signed-in workspace; usage metering given its first producer | done |
| F6 | Correctness against the verified Atlas contract - tenant UUID from the token, generated `requestId`, three error-body shapes, honest absent-vs-zero usage, catalog collapsed to endpoints that actually route | done |
| F7 | Deployed-stage mock guard, `/auth/login` config guard, sign-in/out control, single-label host acceptance | done |
| F8 | Docs - product definition, three ADRs, app-workspace and copy-a-product guides, rewritten checklists and indices | done |
| F9 | Adversarial review pass (contract fidelity / deploy safety / security / rename script / internal consistency), 19 confirmed findings all fixed | done |

Acceptance: `pnpm type-check:all`, `pnpm test` (129 tests, up from 89),
`pnpm lint:docs-numbering`, `pnpm lint:data-design` all green; `next build`
compiles and prerenders; `/api/health`, `/api/status`, `/api/chat` and
`/api/platform-check` verified against a running instance, including tier gating
(403 on an out-of-tier skill) and the deployed-stage guards.

The new tests are weighted at the three wire contracts, because those are the
failures that cannot be reproduced locally: the S2S mint form and its
identity-keyed cache, the Atlas tenant-UUID/usage/error-shape traps, and the
Runos `_meta` placement, accept header, and HTTP-200-with-isError shape.

The F9 review is worth recording for what it caught rather than for passing: the
most valuable finding was that `delegation_token` was carrying the end-user's
access token, whose `aud` is vxtpl's own client id, where Runos verifies it
against `aud=runos` - so every skill invocation would have failed with
`caller_error/invalid_delegation`, and would have read as a Runos fault rather
than ours. It was invisible locally because the production capability catalog is
empty, so the call never reaches invoke today. Also caught: a widened
cleartext-egress rule that admitted public IPv6 literals, a missing
`account_status` gate that let a suspended account keep spending, a webhook that
would 500-and-retry forever on a deployed stage without C2, and a
retag-by-digest path that could ship a `DEPLOY_STAGE=dev` image to production and
silently disable the mock guard.

What batch F does NOT deliver is a verified live call - that needs the
platform-side rows in `docs/50-deployment/10-platform-registration-checklist.md`
and is batch 3.

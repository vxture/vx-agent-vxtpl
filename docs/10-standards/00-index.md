# 10-standards - Org standards (thin index)

This directory does NOT copy standard text. The org standards are authored and
versioned in the platform repo (`D:\MyWebSite\vxture`); every product repo
consumes them by reference so there is a single source of truth. Fix a gap in the
standard there first, then mirror it here - never invent a standard inside a
product repo.

| Standard | Platform-repo path | Covers |
|----------|--------------------|--------|
| Integration general rules | published artifact "Product Integration General Rules" (platform line, 2026-08-28) - the INTERFACE authority; by its own terms it supersedes any conflicting doc | C1 OIDC / C1b S2S exchange, C2 envelope v3 + gating, C3 consume (always-200) + webhook, API-shape MUST set (X/A/B/D/G), go-live checklist |
| Repo governance | `docs/10-standards/140-repo-governance-standard.md` | branch model, ruleset, secret hygiene, SCA gate, data layer, guardrails |
| Docs taxonomy | `docs/10-standards/070-docs-taxonomy.md` | docs numbering and identifiers |
| Security | `docs/10-standards/150-security.md` | secret boundaries |
| CI/CD optimization | `docs/10-standards/010-cicd-optimization-playbook.md` | CI speed-ups |
| Container healthcheck | `docs/10-standards/020-container-healthcheck-standard.md` | liveness probe mechanics: zero-dependency route, bind `0.0.0.0`, probe params |
| Health endpoint contract | `docs/10-standards/025-service-health-endpoint-contract.md` | liveness response body: identity block + build-time provenance injection (companion to 020) |

## Product-repo design and runbook (platform repo)

- `docs/30-design/product_240_repo-template.md` - what a product repo contains
- `docs/50-deployment/rebuild/20-self-rectify-runbook.md` - batch A-G self-rectify
  runbook with per-step machine checks

## What this repo carries locally

The governance base is realized here as concrete artifacts, not prose: the
branch-protection ruleset (`docs/50-deployment/rebuild/main-ruleset.json`), the
secret-scan / SCA / docs-numbering guardrails, and the CI workflows. Those are the
enforcement; this index is the pointer to the WHAT they enforce.

Local realization of the standards above (where to look, not a re-statement):

- **Integration general rules (C1/C2/C3)**: C1 RP under
  `portals/app/app/auth/`, C2 envelope + cache in
  `portals/app/app/entitlement/` (platform-client / platform-resolver), C3 up
  on the always-200 consume contract in `portals/app/app/usage/lib/flush.ts`,
  C3 down (HMAC verify + idempotent/ordered handler) under
  `portals/app/app/provisioning/`. The rules' go-live checklist is executable
  at `/platform-check` (C1 discovery/JWKS, C2 live envelope, C3 verifier
  self-test + click-triggered replay probe = checklist #5). Open platform
  question: liaison letter 140 (credential class for /platform/* calls).
- **020 + 025 (health)**: `buildHealthIdentity()` imported directly from the
  published `@vxture/shared` (single response shape, no local
  re-implementation - see docs/60-operations TD-001), called from the liveness
  route `portals/app/app/api/health/`, fed by the four provenance `ARG->ENV` in
  `portals/app/Dockerfile` (runner stage) and their build-time derivation from
  git tag/sha/date in `.github/workflows/build.yml`. Any product repo copied from
  vxtpl inherits these unchanged, so its `/api/health` conforms out of the box.

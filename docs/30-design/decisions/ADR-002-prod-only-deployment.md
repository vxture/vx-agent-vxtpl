# ADR-002: vxtpl deploys production only

- **Status:** accepted
- **Date:** 2026-08-16 (records an owner decision taken during batch E)

## Context

The org branch model offers product repos two deploy tiers: a `beta-YYYYMMDD.N`
tag deploying an ungated beta stack, and a `vX.Y.Z` tag deploying production
behind a required-reviewer gate.

vxtpl was built with the production tier only. `deploy.yml` triggers on `v*.*.*`
and its routing step rejects any other tag; there is no `beta` GitHub Environment,
no beta host-port allocation, and no `vxturebiz_vxtpl_beta` database. The
`vxtpl-beta` OIDC client name is reserved by the cascade but has never been
registered.

This was an owner decision, but it was recorded nowhere - so `CLAUDE.md` described
a two-tier model the pipeline does not implement, `build.yml` carried dead
`beta-*` and `dev-*` provenance branches, and a reader could not tell whether the
missing beta tier was a decision or an unfinished batch.

## Decision

vxtpl is production-only, and the repo says so.

- `deploy.yml` triggers on `v*.*.*` only; a `beta-*` tag deploys nothing.
- `production` is the only GitHub Environment, and it keeps its required reviewer.
- Dead `beta-*` / `dev-*` branches are pruned from the build provenance staging.
- `vxtpl-beta` stays reserved in the name cascade and unregistered in practice.

A product copied from vxtpl that wants a beta tier adds it deliberately: beta tag
routing in `deploy.yml`, a `beta` GitHub Environment, a distinct `PROJECT_NAME`
(`<code>-beta`) so the two stacks never collide on one host, its own host-port
allocation, the `<code>-beta` OIDC client, and a `vxturebiz_<code>_beta` database.

## Consequences

- One host port, one database, one stack root (`/srv/md0/vxtpl`) to reason about.
- No pre-production environment: a change is verified by CI gates, local run, and
  the required-reviewer pause on the production deploy. There is no place to
  exercise a real platform integration before it is live, which is a real cost and
  the main argument for revisiting this decision later.
- The mock-resolver prod guard (ADR-001) keys on `DEPLOY_STAGE`, which
  `build.yml` sets to `production` for `v*` tags and `dev` otherwise - so it stays
  correct if a beta tier is added later.
- `docs/50-deployment/` checklists describe one environment. A copy adding beta
  extends them rather than discovering the gap during its first beta deploy.

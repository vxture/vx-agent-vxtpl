# ADR-007: the beta tier ships in the template, off until a product turns it on

- **Status:** accepted
- **Date:** 2026-09-10 (owner: 把 beta 通道同步回模版)
- **Amends:** ADR-002 - its "a copy adds the beta tier itself" clause. vxtpl
  itself stays production-only; the ROUTE now ships with the template.

## Context

ADR-002 made vxtpl production-only and told a copy that wanted a beta tier
to add it deliberately: tag routing, a `beta` Environment, a distinct compose
project, its own port, OIDC client and database. The first product to want
one (yucer, 2026-09-10) had to rebuild all of that from the ADR's list, and
found on the way that the two-tier wording in its own `CLAUDE.md` described
a pipeline that refused every `beta-*` tag. A checklist item that every
product will trip over is a template gap, not a product decision.

## Decision

The template carries the two-tier route; a product turns the beta tier ON by
configuration, never by editing a workflow.

| | production | beta |
|---|---|---|
| tag | `v*.*.*` | `beta-*` |
| GitHub Environment | `production` (required reviewer) | `beta` (no reviewer) |
| stack root | `/srv/md0/<code>` | `/srv/md1/<code>` (the second array on worker02) |
| compose project / containers / network | `<code>` / `<code>-app`, `-redis`, `-db` / `<code>-net` | `<code>-beta` / `<code>-beta-*` / `<code>-beta-net` |
| published port | the product's allocation | the allocation's beta number, from the stack's own `etc/.env` |
| database | `vxturebiz_<snake>_prod` | `vxturebiz_<snake>_beta` |
| OIDC client | `<code>` | `<code>-beta` |
| vhost | `<code>.vxture.com` | `beta-<code>.vxture.com` (reserved by the cascade) |

- `deploy.yml` routes both tags in its detect job and derives the stack root
  and project name; concurrency is per tier, from the tag name.
- `db-init.yml` and `rollback.yml` take `environment` as an input and derive
  the same three values; the database suffix follows the tier.
- `build.yml` stamps `stage=beta` for a `beta-*` tag, so `DEPLOY_STAGE` tells
  the app which tier it is running (the ADR-001 prod guard keys on
  `production` and is unaffected).
- `deploy/deploy.sh` takes `PROJECT_NAME` from CI (default: the product code),
  so two stacks on one host share no container name and no network.

OFF BY DEFAULT. Nothing runs until the `beta` Environment holds the host
secrets (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`, `DEPLOY_SSH_KEY`,
`DEPLOY_KNOWN_HOSTS` - GitHub cannot share environment secrets, so the same
host is entered twice) and its own `ENV_FILE_BASE64`. A `beta-*` tag pushed
before that fails at the deploy job's secret check, deploys nothing, and
opens the usual deploy-failure issue. vxtpl itself keeps ADR-002's posture:
no `beta` secrets, no beta stack, `vxtpl-beta` reserved and unregistered.

## Amendment, 2026-09-10 (same day): configuration, not literals

The first cut of this route wrote the two stack roots (`/srv/md0`, `/srv/md1`)
and the project names into the workflows, with a `DEPLOY_DIR` secret as an
override that expected the deploy SUBdirectory - a contract a product owner
read as "the deploy directory on the host" and set to the stack root, which
would have sent `rsync --delete` into `etc/` and `data/`. Every value the
pipeline needs now comes from a GitHub layer and nothing is guessed:

| Value | Layer | Name |
|-------|-------|------|
| product code | repo variable | `PRODUCT_CODE` |
| stack root on the host | Environment variable, REQUIRED | `STACK_ROOT` |
| compose project | Environment variable, REQUIRED | `PROJECT_NAME` |
| ACR namespace | repo variable | `ALIYUN_ACR_NAMESPACE` |
| ACR registry the host pulls from | Environment variable, optional | `ACR_PULL_REGISTRY` (a VPC host sets the org's `ALIYUN_ACR_INTERNAL_HOST`) |
| GHCR namespace | context | `github.repository_owner` |
| shared registry / tailnet / npm | org variables and secrets | as before |

The deploy job, db-init and rollback refuse to run without the required
ones, naming the missing variable and its layer. The deploy directory is
always `<STACK_ROOT>/deploy`; the override is gone. vxtpl's `production`
Environment carries `STACK_ROOT=/srv/md0/vxtpl` and `PROJECT_NAME=vxtpl`
since 2026-09-10; a product's `beta` Environment carries its own.

## Consequences

- A product that wants beta does four things outside the repo: the `beta`
  Environment's secrets and env file, the `<code>-beta` OIDC client, the
  `/srv/md1/<code>` directory on the host, and the `beta-<code>` vhost. The
  bootstrap checklist lists them in order.
- The deploy-time order for a fresh stack is deploy first (it creates the db
  container the DDL runs in), `db-init` second, then the app reconnects.
- ADR-002's "no pre-production environment" cost is now a per-product
  choice rather than the template's shape.

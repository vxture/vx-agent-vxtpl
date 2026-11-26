# Creating a new product repo from vxtpl

vxtpl carries no placeholders (ADR-001). A new product repo is a **copy** of this
one with the name cascade rewritten, not an instantiation of a skeleton.

## The procedure

```bash
git clone https://github.com/vxture/vx-agent-vxtpl.git
cd vx-agent-vxtpl
node scripts/init/create-product.mjs my-prod
cd ../vx-agent-my-prod
pnpm install --frozen-lockfile
pnpm dev
```

The product code must match `^[a-z][a-z0-9_-]{0,31}$`. The generator starts a
new local Git repository in a sibling directory. Use `--output` for a
different new directory, `--dry-run` to inspect the plan, or
`--with-emberstorm` to include the optional challenge module. Candidate
testing on a released checkout can include unstaged source with
`--include-candidate`.

## Generated workspace

The generator copies managed files and uses the site-aware rename script once.
For `my-prod` the name cascade has these forms.

| Form | Where it applies | `my-prod` becomes |
|------|------------------|-------------------|
| raw `<code>` | product identity, compose project and containers, image name, package scope, stack root | `my-prod` |
| snake (`-` -> `_`) | Postgres database name and service role | `my_prod` |
| upper (snake, uppercased) | platform-side secret names | `MY_PROD` |
| kebab | OIDC client defaults, public hostname and matching edge file | `my-prod` |

The distinction matters: a hyphen is illegal in an unquoted Postgres identifier,
so a blind find-and-replace would produce `vxturebiz_my-prod_prod` and a database
that cannot be created. The replacement table is ordered longest-match-first so
every specific site is consumed before the generic rule sees the text.

The generated repository keeps the resolved name cascade. The shared workspace
pages use `portals/app/product.config.json` for the entry mode, direct target and
sample navigation. Development opens all five framework previews at
`/system/frameworks`. The recent-work card and lists consume a domain work
source through `framework/recent-work.server.ts`.

Concretely, `my-prod` derives:

| Slot | Value |
|------|-------|
| OIDC clients | `my-prod` / `my-prod-beta` |
| compose project + containers | `my-prod` / `my-prod-app`, `-redis`, `-db` |
| image | `ghcr.io/vxture/my-prod-app` |
| database / role | `vxturebiz_my_prod_prod` / `my_prod_svc` |
| package scope | `@my-prod/*` |
| secrets | `MY_PROD_DB_SVC_PASSWORD`, `MY_PROD_PROVISION_WEBHOOK_SECRET`, `MY_PROD_WEBHOOK_BASE_URL` |
| stack root | `/srv/md0/my-prod` |
| vhost | `my-prod.vxture.com` (the conf file is renamed too) |

## Included files

The output has fresh operation, plan, liaison and ADR indices. The source
checkout keeps its own history, including the frozen HTML design. Generation
excludes local credentials, browser artifacts and runtime data. With the
default options, the output uses an empty work source and omits the challenge
routes, styles, metrics, capabilities, Prisma model and domain DDL.

## What you still own

1. **Fill the exemplar zone.** The capability matrix, the model/skill catalog, the
   product surfaces under `portals/app/app/`, and the role/permission catalog are
   worked examples to replace - not mechanism to preserve. The boundary is in
   `CLAUDE.md` under "Rigid zone / exemplar zone".
2. **Platform registration** (`docs/50-deployment/10-platform-registration-checklist.md`).
   Nothing real works until the platform line registers the product, issues the
   OIDC client pair, allocates a host port, and grants Atlas/Runos access.
3. **GitHub bootstrap** (`docs/50-deployment/20-github-bootstrap-checklist.md`).
   Apply the branch-protection ruleset **last** - a restrictive ruleset applied
   before the first push blocks that push.
4. **Apply the allocated port.** Update the deployment defaults and the edge
   upstream from the port registry before deploying. The generated local
   default allows an offline run.

Run `pnpm doctor --stage production --env <file> --url <origin>` to check
configuration and the public runtime. Add `--expect-version <version>` when
checking a release candidate. Signed-in workspace operations and their real
receipts complete platform acceptance.

## Adding a beta tier

vxtpl is production-only (ADR-002). If your product needs beta: add `beta-*` tag
routing to `deploy.yml`, create a `beta` GitHub Environment (no reviewer gate),
set `PROJECT_NAME=<code>-beta` so the two stacks never collide on one host, get a
second host-port allocation, register the `<code>-beta` OIDC client, and create
the `vxturebiz_<code>_beta` database. `build.yml` already stages provenance for a
`beta-*` tag as `dev`; extend its case statement when you add the tier.

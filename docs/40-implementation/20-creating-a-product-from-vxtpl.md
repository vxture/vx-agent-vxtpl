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
Set optional `homeHeadline.intervalMinutes` and `homeHeadline.pool` in the same
product config to use a product-specific schedule. The default has 12 titles
and changes at local midnight. A custom pool needs at least 10 distinct entries.

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

## Apply the Atlas and Runos patterns

The generated product includes `/chat` and the separate `/platform-check`.
In a registered workspace, send a short question using **Standard** for the
Atlas-only flow. Select **Convert and summarize HTML** and send
`<h1>Weekly report</h1><p>The team shipped the workspace update.</p>`
for the combined flow. The app runs the authorized Runos converter, feeds
its Markdown into Atlas, and shows the result and call references.

| Application decision | Template entry point | What the next product supplies |
| --- | --- | --- |
| Model-only operation | `chat/atlas-client.ts`, `chat/resolver.ts` | Model endpoint code granted to the product, prompt and result presentation |
| Connector-only operation | `runos/document-conversion.ts` | An entitled capability, operation, risk level, input mapping and expected result |
| Connector followed by inference | `chat/resolver.ts` | Domain sequencing and whether an unavailable capability stops the operation |
| Feature admission and cost | `api/chat/route.ts`, `entitlement/capability.ts`, `usage/lib/flush.ts` | Feature tier, allowed action, registered product metric and unit |
| Acceptance data and receipts | `platform-demo/runos-sample.ts`, `/platform-check` | Dedicated account and workspace, safe sample input and the successful result to check |

Application paths are relative to `portals/app/app/`. Keep the server's
verified Accounts identity, seat check and OBO token exchange in front of
interactive calls. A completed chat turn has one task ID across both
providers and uses that ID as its product metering key. The providers return
their own request or call IDs and account for their own usage. A product
reports its own business unit once, such as a served chat turn.

Set provider URLs and acceptance settings in the deployment environment.
Register those capabilities and the product metric in the platform before
live testing. Build another workflow by copying its input and output
adapter and keeping the existing transport, authorization and metering
modules. The [app workspace guide](10-app-workspace.md) details the request
flow and the [platform checklist](../50-deployment/10-platform-registration-checklist.md)
covers the environment configuration.

Run `pnpm doctor --stage production --env <file> --url <origin>` to check
configuration and the public runtime. Add `--expect-version <version>` when
checking a release candidate. Signed-in workspace operations and their real
receipts complete platform acceptance.

## Enable the usage worker

Use `USAGE_FLUSH_MODE=demo` with the configured `PLATFORM_DEMO_WORKSPACE_ID`,
`PLATFORM_DEMO_SUBJECT` and `USAGE_FLUSH_DEMO_KEY`. The key is the one written
to the local usage buffer by the approved business action. In the included
chat flow it is the returned task ID. The job submits only the row matching
all three values. Check the original platform event ID and the local
`flushed` flag after delivery.

Set `USAGE_FLUSH_MODE=on` when the product's registered metrics and full buffer
are ready for regular reporting. The product worker runs on startup and five
minutes after each pass. Leave the mode unset for deployments that already
schedule the internal endpoint externally.

## Adding a beta tier

vxtpl is production-only (ADR-002). If your product needs beta: add `beta-*` tag
routing to `deploy.yml`, create a `beta` GitHub Environment (no reviewer gate),
set `PROJECT_NAME=<code>-beta` so the two stacks never collide on one host, get a
second host-port allocation, register the `<code>-beta` OIDC client, and create
the `vxturebiz_<code>_beta` database. `build.yml` already stages provenance for a
`beta-*` tag as `dev`; extend its case statement when you add the tier.

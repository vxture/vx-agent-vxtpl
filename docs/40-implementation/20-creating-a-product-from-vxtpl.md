# Creating a new product repo from vxtpl

vxtpl carries no placeholders (ADR-001). A new product repo is a **copy** of this
one with the name cascade rewritten, not an instantiation of a skeleton.

## The procedure

```bash
git clone https://github.com/vxture/vxture-vxtpl.git vxture-<code>
cd vxture-<code>
rm -rf .git && git init            # start your own history
node scripts/init/rename-product.mjs <code> --dry-run   # read the report first
node scripts/init/rename-product.mjs <code>
pnpm install                       # regenerates pnpm-lock.yaml under @<code>
pnpm type-check:all && pnpm test
```

The product code must match `^[a-z][a-z0-9_-]{0,31}$`.

## What the rename script does

It rewrites file **contents** and file/directory **names** in one pass, and it is
site-aware, because one product code produces three lexical forms:

| Form | Where it applies | `my-prod` becomes |
|------|------------------|-------------------|
| raw `<code>` | OIDC clients, compose project and containers, image name, public vhost, package scope, stack root | `my-prod` |
| snake (`-` -> `_`) | Postgres database name and service role | `my_prod` |
| upper (snake, uppercased) | platform-side secret names | `MY_PROD` |

The distinction matters: a hyphen is illegal in an unquoted Postgres identifier,
so a blind find-and-replace would produce `vxturebiz_my-prod_prod` and a database
that cannot be created. The replacement table is ordered longest-match-first so
every specific site is consumed before the generic rule sees the text.

The script also rewrites **itself**, so the copy's `CURRENT` constant reads as the
new code and the copy can in turn be copied. Renaming is a chain, not a one-shot
from vxtpl. That is also why the table is derived from `CURRENT`'s three forms
rather than hard-coded: a repo already renamed to `my-prod` carries `my_prod_svc`
in its DDL, and a table built only from the raw `my-prod` would walk straight past
it.

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

## What the script deliberately refuses to touch

`docs/80-liaison/`, `docs/70-workplan/`, and the tech-debt register record what
vxtpl did, when, and with whom. Rewriting `vxtpl` to your code inside them would
not carry history forward - it would fabricate it, leaving your repo claiming to
have sent letters it never sent. The script lists these files and leaves them
alone; delete or archive them before your first commit.

## What you still own

The script prints this list when it finishes. In order of when it bites:

1. **Delete vxtpl's history** - liaison correspondence, batch tracker, tech-debt
   register.
2. **Replace `docs/20-specs/`** with your product definition, and start a fresh
   ADR register at ADR-001. vxtpl's ADRs are vxtpl's decisions.
3. **Fill the exemplar zone.** The capability matrix, the model/skill catalog, the
   product surfaces under `portals/app/app/`, and the role/permission catalog are
   worked examples to replace - not mechanism to preserve. The boundary is in
   `CLAUDE.md` under "Rigid zone / exemplar zone".
4. **Platform registration** (`docs/50-deployment/10-platform-registration-checklist.md`).
   Nothing real works until the platform line registers the product, issues the
   OIDC client pair, allocates a host port, and grants Atlas/Runos access.
5. **GitHub bootstrap** (`docs/50-deployment/20-github-bootstrap-checklist.md`).
   Apply the branch-protection ruleset **last** - a restrictive ruleset applied
   before the first push blocks that push.
6. **Get a port allocation and re-point the edge vhost.** Ports come from the org
   port registry and nowhere else - do not pick one. `configs/edge/<code>.vxture.com.conf`
   still carries vxtpl's upstream port; set yours there and in `APP_PUBLISH_PORT`
   (one number, both places), then hand the vhost to the edge operator.

## Adding a beta tier

vxtpl is production-only (ADR-002). If your product needs beta: add `beta-*` tag
routing to `deploy.yml`, create a `beta` GitHub Environment (no reviewer gate),
set `PROJECT_NAME=<code>-beta` so the two stacks never collide on one host, get a
second host-port allocation, register the `<code>-beta` OIDC client, and create
the `vxturebiz_<code>_beta` database. `build.yml` already stages provenance for a
`beta-*` tag as `dev`; extend its case statement when you add the tier.

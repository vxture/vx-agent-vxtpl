# 60-operations - Runbooks, audits, tech debt, incidents

Operational material for this repo: runbooks (`RUN-*`), audits, the tech-debt
register (`TD-NNN`), and incident notes.

## Tech-debt register (TD-NNN)

Append-only. Each entry is a known, deliberately-deferred debt with a stable ID
(never reused). These are vxtpl's; a repo copied from vxtpl starts an empty
register rather than inheriting them.

| ID | Title | Opened | Status |
|----|-------|--------|--------|
| TD-001 | Wire the published `@vxture/shared` value-domain dependency + alignment guardrail | 2026-07-21 | closed 2026-07-21 |
| TD-002 | Vendored health-identity implementation deviated from 025's shared-helper clause (undeclared) | 2026-07-21 | closed 2026-07-21 |
| TD-003 | C2 entitlement + usage flush still use the deprecated `x-vxture-internal-auth` shared header | 2026-08-16 | open |
| TD-004 | `local_authz` is schema-only - no code reads or writes the membership and role tables | 2026-08-16 | open |
| TD-005 | No request-level tests for the auth, webhook and chat routes | 2026-08-16 | open |
| TD-006 | Port cutover to 4000 is not executed on the deploy host | 2026-08-17 | open |

### TD-001 - `@vxture/shared` value-domain dependency

`product_220` section 3 / `product_240` section 2.4 make `@vxture/shared` the
single authority for the commercial value domains (tier five values,
subscription status six values, `METRIC_KINDS`). The template defined these
locally (`portals/app/app/entitlement/types.ts`) because `@vxture/shared`
installs from GitHub Packages and needs `NODE_AUTH_TOKEN`, which local dev did
not yet have (CI already had it as an org secret - see the credentials note
below).

**Closed 2026-07-21**: `gh auth refresh -s read:packages` unblocked local
install. `@vxture/shared@1.5.0` is now a real dependency of
`portals/app/package.json`; `entitlement/types.ts` imports `TIERS` /
`SUBSCRIPTION_STATUSES` / `Tier` / `SubscriptionStatus` directly from
`@vxture/shared` and re-exports them (local consumers - `capability.ts`,
`entitlement-matrix/page.tsx` - are unchanged, still import from `./types`).
Confirmed the published values are byte-for-byte identical to the prior local
copy (five tiers, six statuses, same order - order is load-bearing for
representative-status precedence).

The planned `check-catalog-domains`-style diff guardrail turned out to be
**unnecessary**: importing the value arrays directly (not copying their
literal contents) makes drift structurally impossible - there is nothing left
to diff against. A local DDL `CHECK` constraint on `tier`/`status` was also
considered; the template's DDL does not persist either column locally (C2
entitlement is platform-sourced, not locally stored), so there is no DDL side
to reconcile.

**Same migration also retired the template's health-identity duplicate**:
`@vxture/shared@1.5.0` now publishes `buildHealthIdentity()` /
`serviceIdentity()` matching `docs/10-standards/025-service-health-endpoint-
contract.md` exactly (same field names, same honest-fallback semantics via
`APP_VERSION`/`GIT_SHA`/`DEPLOY_STAGE`/`BUILD_TIME`). The template's own mirror
(`portals/packages/shared/src/health.ts` + `version.ts`) was deleted in favor
of importing directly - the exact anti-pattern 025 section 6 warns against
("各服务各写一份健康响应结构...一律用共享助手") would otherwise have re-appeared
the moment the platform published a real implementation of what the template
had already hand-rolled.

CI `build`/`test-coverage` jobs' `pnpm install --frozen-lockfile` steps now
pass `NODE_AUTH_TOKEN: ${{ secrets.NODE_AUTH_TOKEN }}` (previously unset -
harmless while no `@vxture/*` dependency existed, required now that a real one
does). CI already had `NODE_AUTH_TOKEN` as an org-level secret; the only new
piece this closure needed was refreshing local-dev `gh auth` with the
`read:packages` scope so the lockfile could be updated in the first place.

### TD-002 - vendored health-identity implementation (undeclared deviation)

**Retroactive registration**, filed per the platform's 2026-07-21 deviation
discipline (`140-repo-governance-standard.md` execution-model section):
standard clauses that cannot yet be met because an upstream dependency is not
ready must be (1) annotated at the implementation site, (2) registered here by
name (clause / reason / recovery condition), and (3) reported to the platform
line - silent deviation fails self-rectify acceptance.

- **Clause deviated from**: `docs/10-standards/025-service-health-endpoint-
  contract.md` section 5/6 - "single shared helper, no service hand-rolls its
  own response shape."
- **Reason**: earlier the same day, the template built its own
  `buildHealthIdentity()` in `portals/packages/shared/src/health.ts` (mirroring
  025's documented shape) because `@vxture/shared` did not yet publish a real
  implementation - the dependency did not exist to import. This was a
  reasonable stopgap but was never declared as a deviation (no TD entry, no
  report to the platform line) - exactly the undeclared-deviation failure mode
  the platform's new discipline exists to close. The platform caught it via an
  unrelated arda cross-check and issued
  `docs/20-specs/220-vxtpl/10-vxtpl_301_shared-150-health-import-2607212159.md`
  (`vxtpl_301`).
- **Recovery condition**: `@vxture/shared` publishes `buildHealthIdentity()` /
  `serviceIdentity()`.
- **Closed 2026-07-21**: condition met at `@vxture/shared@1.5.0` (same release
  that resolved TD-001). The vendored `health.ts`/`version.ts` were deleted in
  the same change (see TD-001 above); the liveness route and status/page
  consumers now import `@vxture/shared` directly. No live implementation site
  remains to annotate (the vendor file no longer exists) - this entry plus the
  reply liaison letter (`docs/80-liaison/`) are the closure record `vxtpl_301`
  §3.4 asked for.

### TD-003 - C2 and usage flush still use the deprecated shared-secret header

`entitlement/platform-client.ts` and `usage/lib/flush.ts` authenticate to the
platform with `x-vxture-internal-auth`, a long-lived shared secret carried in
`PLATFORM_INTERNAL_AUTH_TOKEN`.

The platform now dual-accepts that header OR a Bearer S2S token with
`audience=vxture` (the `PLATFORM_S2S_AUDIENCE` sentinel), and intends to retire
the shared-secret path once callers migrate. vxtpl already mints S2S tokens for
Atlas and Runos (ADR-003), so the migration is a change of header on two call
sites, not new machinery - and it would remove the last long-lived shared secret
from the runtime environment.

- **Why deferred**: batch F was one decision - "S2S tokens are minted, not
  configured". Folding a C2 auth migration into it would have coupled a
  behaviour change on the entitlement path (which gates paid access) to a
  repositioning change, with one test run to catch both.
- **Cost of waiting**: vxtpl is the reference build, so every product copied
  from it inherits the deprecated convention and will need the same migration.
- **Recovery condition**: platform confirms the Bearer path is preferred for
  `/platform/entitlements` and `/usage/consume`; then switch both call sites to
  `mintS2SToken(PLATFORM_AUDIENCE, ...)` with the header as configured fallback.

### TD-004 - `local_authz` is schema-only

`prisma/schema.prisma` defines the five `local_authz` models (member, role,
permission, and the two link tables), `00_baseline.sql` creates them, and
`98_column_locks.sql` locks their writable columns. No application code reads or
writes any of them.

The consequence is narrower than it looks: authorization currently works, because
it runs entirely off the platform's governance roles in the access token
(`auth/lib/claims.ts`). What is missing is the product-LOCAL layer - a member row
created on first authenticated request, product-specific roles resolved per
(workspace, sub) - which is the pattern a real product needs the moment it wants
a permission the platform does not model.

- **Why deferred**: vxtpl has no domain permission to gate, so any
  implementation would be a demonstration with no user. Writing one anyway risks
  encoding a shape that turns out wrong for the first product that actually needs
  it.
- **Cost of waiting**: the exemplar has a documented pattern with no worked
  example, which is exactly the gap ADR-001 says an exemplar should not have.
- **Recovery condition**: the first real permission requirement, or a decision
  to demonstrate the pattern on the provisioning `onProvisioned` hook (which is
  also currently unwired).

### TD-005 - no request-level tests for the security-critical routes

The units beneath them are well covered - PKCE, claim parsing, webhook signature
verification and rotation, flush semantics - but no test invokes the exported
`GET`/`POST` handlers of `auth/login`, `auth/callback`, `auth/backchannel-logout`,
`provisioning/webhook`, or `api/chat` with a crafted `Request`.

Those five are where a wiring mistake is most expensive: a callback that forgets
to consume state, a webhook route that verifies the signature against a parsed
body instead of raw bytes, a chat route that resolves entitlement for the wrong
workspace. Unit tests cannot catch any of those, because each is a mistake in the
assembly rather than in a part.

- **Why deferred**: these handlers reach Redis and the cookie store, so the tests
  need injectable seams that do not exist yet. Adding them is a refactor of the
  route modules, not a test-writing task.
- **Recovery condition**: introduce a thin dependency object per route (the
  provisioning handler already has one) and assert the request-level contracts:
  webhook accept/reject on signature, state replay rejection on callback, 403 on
  an ungated model, 401 with no session.

### TD-006 - Port cutover to 4000 is not executed on the deploy host

The org port registry moved vxtpl from `3210/3211` (L2, object-domain) to
`4000/4001` (L3, industry agent) on 2026-08-13, on the grounds that vxtpl is
agent-level rather than an object domain; `3210/3211` now belongs to ontos. The
registry records vxtpl's status as **in production, cutover not executed**.

This repo is now entirely on 4000 - image default and `EXPOSE`, compose,
`deploy.sh`, `.env.example`, the edge vhost's `$upstream`, `pnpm dev`. The
deploy host is not: `/srv/md0/vxtpl/etc/.env` still carries
`APP_PUBLISH_PORT=3210`, so a deploy still brings the stack up on the old
number. **Changing this repo does not move production.** Two things have to
happen on the operations side, and they are one number so they happen together:

1. `APP_PUBLISH_PORT=4000` in the deploy host's `etc/.env`, then redeploy.
2. The edge vhost's `$upstream` set to `vx-worker-02:4000`. `configs/edge/vxtpl.vxture.com.conf`
   is the source of record and already says 4000; it must be installed, not
   just committed. Owner is handling the edge separately.

Order matters only in that both must land before traffic is correct; between
them the site is down, so do them in one window rather than a day apart.

**Why this is a TD entry rather than a note.** The 2026-08-17 v0.2.0 deploy is
what surfaced it, and it surfaced badly: the deploy reported a health failure
against a container Docker had already marked healthy, because `verify` read
the port from a shell variable CI never exports while compose read it from
`--env-file`. The two disagreed silently and the failure pointed at the wrong
thing. `deploy.sh` now reads the same file compose does and logs which port it
probed, so the next mismatch is legible instead of a phantom outage - but the
underlying split between what this repo says and what the host runs stays open
until the cutover is executed, and anyone reading the repo would otherwise
conclude production is on 4000.

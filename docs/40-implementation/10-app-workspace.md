# The app workspace

## Layout

A pnpm workspace with two packages under `portals/`, per the governance
source-directory slots:

```
portals/
  app/                  @vxtpl/app     - the Next.js 15 application (App Router)
  packages/shared/      @vxtpl/shared  - product identity constants
```

`@vxtpl/shared` exists to hold exactly one thing well: `BRAND`, the single source
of product identity. Everything that names the product - the health payload, C2
entitlement lookups, the C3 webhook's wrong-product check - reads
`BRAND.productCode` from there. Never derive the product code from
`OIDC_CLIENT_ID`: the beta client is `vxtpl-beta` while the product code stays
`vxtpl`, so on any non-prod stack the two diverge and every attribution is wrong.

`@vxture/shared` (note the different scope) is the published org package, resolved
from GitHub Packages. It owns the health-identity helper and the subscription
value domains. Import from it rather than re-implementing - a local copy of
`TIERS` is what TD-001 was about.

## Local development

```bash
pnpm install                 # needs NODE_AUTH_TOKEN for the @vxture scope
cp .env.example .env
pnpm dev                     # http://localhost:4000
```

An empty `.env` works: entitlement and chat fall back to mock resolvers, and
`/api/chat` resolves against a local dev workspace rather than demanding a
session, so every page is explorable with no credentials. `MOCK_TIER` /
`MOCK_STATUS` / `MOCK_BUNDLED` drive the mock entitlement resolver to any
tier x status combination, which is how the gating logic gets exercised without a
platform.

Both affordances are gated on `DEPLOY_STAGE` (`app/lib/deploy-stage.ts`), which
the image always sets from the git ref. On `production` or `beta` the mock
resolvers refuse to start and chat requires a real session. That guard is the
whole difference between this and the old `DEMO_WORKSPACE_ID`, which applied on
every stack: a deployed app resolving entitlement for a workspace nobody owns
grants or denies paid access on the strength of an env var, with a badge on a
status page as the only signal.

The gates CI runs, in the order they are cheapest to fix:

```bash
pnpm type-check:all
pnpm test
pnpm lint:docs-numbering
pnpm lint:data-design
```

## How a chat turn flows

`/chat` is the surface worth reading first, because one user action exercises the
whole integration chain:

1. **Session** - `api/chat/route.ts` resolves the RP session cookie to an
   `AuthUser` plus the raw access token (`auth/lib/session.ts`). No session, no
   turn: the workspace is what entitlement is scoped to, what the S2S token is
   minted against, and what Atlas attributes the call to.
2. **Entitlement** - `entitlement/resolver.ts` resolves the workspace's tier via
   C2 (45s cache, invalidated by C3, stale-on-error, fail-closed).
3. **Gate** - `entitlement/capability.ts` checks the selected model and skill
   against `CAPABILITY_MATRIX`. This happens before anything is spent: an
   ungated selection is a 403 with no token minted and no capability invoked.
4. **Token** - `lib/s2s-token.ts` mints an on-behalf-of S2S token by RFC 8693
   exchange. Tokens live 300 seconds and are cached per (audience, mode,
   identity) with a 30-second margin. See ADR-003 for why there is no
   `ATLAS_S2S_TOKEN`.
5. **Skill** (optional) - `chat/skill-runner.ts` runs the Runos loop:
   discover -> resolve -> invoke -> report_outcome. It searches the catalog
   rather than hard-coding capability ids, because the entitled catalog is
   per-caller and changes without vxtpl redeploying. A skill that cannot run
   degrades the turn instead of failing it.
6. **Inference** - `chat/atlas-client.ts` posts to Atlas `/v1/chat`, threading
   any skill result into the prompt.
7. **Metering** - `usage/lib/buffer.ts` records one `vxtpl.chat.messages` event.
   Deliberately not token counts: Atlas meters model tokens itself under
   `atlas.chat`, so reporting them here would double-count. A metering failure
   is logged and swallowed - it must not fail a turn the user already waited for.

## Things that look wrong but are not

- **`tenantId` on the Atlas request is a UUID from the token, not the product
  code.** Sending the product code appears to work while a grant exists, then
  fails with `400 INVALID_TENANT_ID` when it does not - an error that reads like
  a payload bug. A non-UUID also silently writes NULL into Atlas's request log,
  so the traffic vanishes from tenant rollups with no error at all.
- **`assertInternalTarget` accepts dot-less hostnames.** A single-label name
  cannot resolve on public DNS, so `http://worker-02:3100` is internal by
  construction - and that is exactly how the platform line publishes the Atlas
  and Runos base URLs.
- **A chat turn's Runos call mints on-behalf-of.** Not because service mode is
  unavailable (Runos accepts it since v0.6.0) but because the call is made by a
  person: OBO is what lets the platform derive the workspace from a verified
  token instead of trusting our claim, and what gives Runos a real end user to
  attribute the capability call to.
- **`usage` is absent rather than zero when Atlas reports nothing.** Zeros there
  would be a claim about consumption rather than the absence of one.
- **A Runos Skill returns instructions, not a result.** Runos distributes skills
  and never executes them, so a `result_kind: "distributed"` invoke hands back
  the skill's own content for vxtpl's runtime to use. Connectors and Executors
  return a payload; the skill runner handles both.
- **Prisma generates the client; it is not the schema authority.** `deploy/database/ddl/`
  is, and `db-init.yml` is the only thing that applies it. There is no migrations
  directory on purpose, and `check-data-architecture.mjs` enforces that the two
  stay in lockstep.

## Tests

`node:test` via `tsx`, colocated as `*.test.ts`. They are offline by
construction - no test reaches a network - which is what lets `test-coverage` be
a required check that never flakes.

The suite is not uniform coverage; it is weighted to the places where being wrong
is expensive: the OIDC claim bug-guards (`auth/lib/claims.test.ts` encodes two
confirmed platform integration bugs so they cannot come back), webhook signature
verification and rotation, flush 409-terminal semantics, and the status page's
no-secret-leak invariant.

The three client test files (`lib/s2s-token.test.ts`, `chat/atlas-client.test.ts`,
`runos/client.test.ts`) exist for a narrower reason: they pin wire details that
fail *quietly*, and that nothing local can reproduce. A `_meta` block one level
too deep, an `accept` header missing one media type, a `tenantId` that is a
product code instead of a UUID, a `usage` block of zeros that means "unreported" -
each of those either works until it suddenly does not, or reports the wrong thing
forever without erroring. Those tests are the only place that knowledge is
checkable without a live platform.

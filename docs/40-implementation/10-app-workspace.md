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
session, so every page is explorable with no credentials. Set `MOCK_TIER=free`
to send a mock chat turn, or `MOCK_TIER=pro` to exercise work history. `MOCK_TIER` /
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

## Product session lifecycle

The OIDC callback consumes one Redis state record after checking the binding
cookie created by the initiating browser. Redis arbitrates refreshes across
instances. A refresh can update only the live record it rotated. Logout
deletes the record atomically and a short-lived sid marker prevents a callback
already in flight from recreating it.

On `POST /auth/backchannel-logout`, Vxtpl verifies the registered client's
standard OIDC logout token. It acknowledges the delivery after Redis applies
the revocation. A storage failure returns a retryable response. Repeat
deliveries are safe and act on the same central sid.

`GET /auth/events` is a same-origin SSE stream for a live RP cookie. Each
browser tab shares the stream across session consumers. Redis publication
tells open pages when their RP session ends. A transport reconnect rechecks
the session store. Chat opens its recovery overlay and retains the draft.
Ordinary work pages and Emberstorm return to the gate.

## Product access and provisioning

The web gate, chat, game APIs and recent work read the current platform seat
for the verified account and workspace before returning protected data or
running an operation. Subscription and feature checks remain independent.
A current denial and a temporarily unavailable platform decision have distinct
UI and API responses.

The canonical webhook validates the signed payload and applies the delivery,
workspace state and ordering watermark in one transaction. Unversioned notices
do not advance the watermark. A ready response to the platform uses a product
service ticket bound to that workspace. Its receipt is recorded per workspace
and sequence after the platform confirms it.

The Node runtime starts provisioning reconciliation in configured deployments.
It uses the product-scoped provisioning-read ticket to walk the platform list
at startup and every 15 minutes after a round. It applies newer states and
retries missing ready acknowledgements. Pending or absent rows leave local
state in place. Operations can also invoke the internal reconciliation route
with the shared internal job token already used by the usage flush route.

## Platform integration acceptance

Open `/platform-check` from the workspace home. The first action reads the
Accounts issuer and keys, the verified workspace session, the OBO exchange,
current product access, the first roster page, entitlements, the provisioned
instance state, the Atlas authorized chat routes and the Runos capability catalog.
The designated operator also sees the Atlas direct-model catalog.
The roster row displays a count for the first page. Each row requires evidence
from its own source.

Configure a dedicated workspace and operator using
`PLATFORM_DEMO_WORKSPACE_ID` and `PLATFORM_DEMO_SUBJECT`. For Runos, set
`PLATFORM_DEMO_RUNOS_CAPABILITY_ID=markitdown.document-to-markdown` for the
included HTML conversion sample. The acceptance check calls the same adapter
as the workspace's **Convert and summarize HTML** chat workflow.
The operator signs in using the registered confidential client and an active
product seat. The server confirms the current seat before each action.

1. Run the C3 usage replay. Keep the returned original event ID as the receipt.
   The same UTC-day workspace key is sent twice through the worker's
   workspace-bound product service client.
2. Run both Atlas inference samples and the Runos invocation. Each action
   uses fixed sample content and its own daily attempt limit. The Atlas route
   action uses the first active authorized chat route eligible at the product
   tier. The model action rereads the catalog for active entries with
   `modelType: "chat"` and sends the chosen code for Atlas to authorize.
   Record the requested target, actual model,
   request ID and task ID for each. Runos also confirms receipt of the
   outcome report.
3. Trigger provisioning through the platform and recheck the workspace's stored
   state. Confirm logout by keeping the demo open and signing out of another
   product under the same Accounts session. The demo returns to the gate.

Record the tested environment, build, workspace, time and receipts in the
[batch tracker](../70-workplan/10-template-foundation-batches.md).
Preflight restores successful receipts for the current UTC day after a
refresh or sign-in for the same designated account, organization and
workspace. A used daily attempt remains blocked even if it has no recoverable
receipt. The route, direct-model and Runos actions reserve attempts
independently.
Use the [integration general rules](https://claude.ai/code/artifact/20e37039-ea59-4c5d-9fab-ba3ca3ad54f0)
and [product integration example](https://claude.ai/code/artifact/f0bd83c7-6296-4200-a7d8-108b7755f584)
for the platform interface contract.

## Entitlement and usage runtime

Interactive C2 reads use an OBO ticket from the verified current session. A
workspace without subscription coverage can return an empty entitlement and
show the subscribe action. A failed exchange, invalid response, or unavailable
platform blocks protected operations with a temporary-unavailability response.
Product seat checks use the live platform decision.

Vxtpl shares C2 snapshots in Redis for up to 45 seconds. Open and close events,
subscription notifications, reconciled versions and confirmed usage receipts
evict the workspace snapshot. The Redis write checks the marker captured before
the platform request so a delayed response cannot restore an evicted snapshot.
When Redis is unavailable, C2 reads the platform directly.

The Node runtime starts the usage worker when `USAGE_FLUSH_MODE` is set. It
runs at startup and five minutes after each pass. `POST /api/usage/flush` runs
the same job on demand with the internal job token. Both entry points acquire
the same Redis lease within a deployed stack.

The worker exchanges a platform service ticket for each workspace and sends
the original amount, end-user attribution and idempotency key. A valid 200
receipt with `event_id` and completed cache eviction clears the local row.
Unconfirmed rows keep their original keys for replay.

## How a chat turn flows

The catalogue response carries a workspace scope label derived from the
verified account, organization and workspace with the product's confidential
client key. Both chat surfaces send it with each turn. The
API verifies the live session and compares the expected scope before inference
or usage recording. A recovery check for the same scope restores the mounted
conversation. A different scope starts clean. Recovery only reads the catalogue,
and the user chooses whether to send the previous draft.

`/chat` is the surface worth reading first, because one user action exercises the
whole integration chain:

1. **Session** - `api/chat/route.ts` resolves the RP session cookie to an
   `AuthUser` plus the raw access token (`auth/lib/session.ts`). No session, no
   turn: the workspace is what entitlement is scoped to, what the S2S token is
   minted against, and what Atlas attributes the call to.
2. **Entitlement** - `entitlement/resolver.ts` resolves the workspace's tier via
   C2 with the current OBO ticket and the shared 45-second cache.
3. **Gate** - The API checks the current product seat and combines the Atlas
   route directory with the workspace tier. A model must be an active chat
   route. The Vxtpl tier and skill checks use `entitlement/capability.ts`.
   A denied selection returns 403 before any inference or skill invocation.
4. **Token** - `lib/s2s-token.ts` mints an on-behalf-of S2S token by RFC 8693
   exchange. Tokens live 300 seconds and are cached per (audience, mode,
   identity) with a 30-second margin. See ADR-003 for why there is no
   `ATLAS_S2S_TOKEN`. The same OBO identity reads `GET /v1/model-routes` and
   makes the chat request. The server fetches routes on page load and before
   each turn.
5. **Skill** (optional) - `chat/skill-runner.ts` runs the Runos loop:
   discover -> resolve -> invoke -> report_outcome. It searches the catalog
   rather than hard-coding capability ids, because the entitled catalog is
   per-caller and changes without vxtpl redeploying. The HTML conversion
   workflow selects the specific connector and read operation via
   `runos/document-conversion.ts`, encodes inline HTML as the operation's
   `uri` argument and stops if conversion fails. Other skills can degrade
   the turn when their capability is unavailable.
6. **Inference** - `chat/atlas-client.ts` posts to Atlas `/v1/chat`, threading
   any skill result into the prompt. The completed turn shows the shared
   task ID, actual Atlas request and model, and Runos call and outcome when
   applicable. Chat and the assistant share the same
   error response. Atlas capacity limits return 429 with the retry delay when
   provided. Upstream account refusal returns 503 with a temporary-unavailability
   message and no provider account details. A failed turn leaves the draft in
   place. A new request requires an explicit send.
7. **Metering** - `usage/lib/buffer.ts` records one `vxtpl.chat.messages` event
   keyed by the real turn's task ID. The flush boundary converts an Accounts
   customer subject into the account UUID for optional end-user attribution.
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
verification and rotation, usage receipt verification and replay, and the status page's
no-secret-leak invariant.

The three client test files (`lib/s2s-token.test.ts`, `chat/atlas-client.test.ts`,
`runos/client.test.ts`) exist for a narrower reason: they pin wire details that
fail *quietly*, and that nothing local can reproduce. A `_meta` block one level
too deep, an `accept` header missing one media type, a `tenantId` that is a
product code instead of a UUID, a `usage` block of zeros that means "unreported" -
each of those either works until it suddenly does not, or reports the wrong thing
forever without erroring. Those tests are the only place that knowledge is
checkable without a live platform.

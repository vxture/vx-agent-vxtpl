# vxtpl - product definition

## What vxtpl is

vxtpl is a Vxture product with a real business domain: **Emberstorm**, a
bullet-dodging reaction game (its mode: the 20-Second Challenge) whose three
subscription tiers exercise the platform's quota / subscription / entitlement
machinery with real users (ADR-006, spec in `20-challenge-game.md`). The
product code is `vxtpl` and the product shell displays `Vxtpl`. Emberstorm
is the game module. Its second subject matter is the
platform integration surface itself, made visible and exercised in production.

Both roles are deliberate and reinforce each other. vxtpl is the reference
build every new Vxture product is copied from (ADR-001), and a reference nobody
runs drifts from reality within weeks - while a product nobody USES verifies
the integration surface but never the product surface. By deploying vxtpl at
`https://vxtpl.vxture.com`, giving it users, and holding it to the same gates
as any product, both the integration contracts and the tier-gating patterns
stay verified by execution rather than by review.

## Surfaces

Vxtpl has a public entry and a workspace home. Emberstorm keeps its fullscreen
command deck at `/play`, including daily quota, records and trends, the global
board, identity, and conversion. Records and the board stay in collapsible rails.

| Route | What it is |
|-------|-----------|
| `/` | Public product entry in overview mode. Direct mode opens the configured module through the existing access controls. |
| `/gate` | Checks the session and workspace entitlement before opening the requested destination. |
| `/home` | Workspace home with the day's greeting, chat and Emberstorm entry points, and recent challenge records when history is available. |
| `/home/work`, `/home/work/:id` | Personal challenge history for the active workspace and current season, with the same history limits as the deck. Record details check access again. |
| `/play` | Emberstorm fullscreen deck. Old `/challenge` links redirect here and retain their query parameters. |
| `/chat` | Tier-gated integration chat and assistant. Session recovery retains the draft in this tab after the same workspace and account are confirmed. Limits: 500 chars/message, 20-message history, and 6 turns/minute per (workspace, sub). |
| `/status` | Debug/reference: live configuration state of every integration channel, presence booleans only |
| `/platform-check` | Debug/reference: read-only connectivity probes against Atlas and Runos |
| `/entitlement-matrix` | Debug/reference: every tier x status combination and its gate/CTA outcome, fully offline |

The integration checks remain available from the deck's avatar menu. Two surfaces
exercise full integration flows.
`/chat` exercises the whole S2S chain in a single user action: session ->
workspace -> entitlement -> capability gate -> S2S token mint -> Atlas call ->
optional Runos capability -> usage record. The deck exercises the whole
commercial chain: entitlement -> capability gate -> locally-counted quota
against a domain table -> domain write -> usage record -> conversion
deep-link. The rest exist so that when either chain breaks, the failing link
is visible without a debugger.

## Platform contracts consumed

| Channel | Contract | vxtpl's use |
|---------|----------|-------------|
| C1 | OIDC relying party against `accounts.vxture.com` | PKCE sign-in, browser-bound single-use state, nonce verification, an opaque session cookie, and back-channel logout. The browser receives revocation through a same-origin event stream. |
| C2 | `GET /platform/entitlements` | Resolves the caller's subscription tier and quota pools for the active workspace; 45s cache, invalidated by C3, stale-on-error, fail-closed to no-coverage. |
| C3 | Inbound provisioning webhook + `POST /usage/consume` | Webhooks are HMAC-verified over raw bytes, idempotent and sequence-ordered. Entitlement-changing events evict the shared C2 cache. The worker reports buffered usage with a workspace-bound product service ticket, optional `end_user_id` and the original key as `x-request-id`. A valid 200 receipt with `event_id` and completed cache eviction confirm the row. Unconfirmed rows are replayed under the same key. |
| Atlas | Chat inference and model listing | Every chat turn. Atlas meters model token consumption itself; vxtpl records only its own product-level counter. |
| Runos | Capability discovery and invocation | Skill execution on a chat turn, plus a read-only well-known probe on `/platform-check`. |

S2S credentials for Atlas, Runos, and the platform are **minted per call** via
RFC 8693 token exchange, never configured as long-lived environment values - see
ADR-003.

Three constraints from those contracts shape the code more than they look like
they should, and are worth stating where a reader will meet them:

- **The minted token carries the attribution.** Atlas takes tenant and workspace
  from the token's claims, and a request body can never override a verified
  claim. A token without `workspace_id` does not fail - it skips the quota check
  and records usage against no workspace, dropping the call out of the
  tenant-by-workspace rollup that billing is computed from.
- **A user-initiated call mints on-behalf-of.** The workspace and subject come
  from the presented session token rather than anything vxtpl declares, which is
  what makes the claim unforgeable - and Runos uses the resulting `sub` as the
  end-user on its audit trail. Service mode is available too (Runos v0.6.0), so
  a background path exists; vxtpl has no scheduled capability work today.
- **Skills are distributed, not executed.** A Runos Skill answers with its own
  content for the caller's runtime to run (Runos ADR-006); only Connectors and
  Executors return a result. vxtpl handles both shapes.

## Entitlement model

vxtpl's capability matrix (`portals/app/app/entitlement/capability.ts`) is the
exemplar of a product blank zone filled in: tier rules for granted Atlas
routes, skills, and the game's five `game:*` keys, gated cumulatively
across the five subscription tiers. The *mechanism* - `canUseFeature`,
`minTierFor`, the `hasProductAccess` / `hasDataAccess` / `ctaFor` formulas, and
the value domains imported from `@vxture/shared` - is rigid and shared
org-wide. The *content* of the matrix is vxtpl's, and a copied product replaces
it.

The game adds the quota exemplar: the free tier's 10-runs-a-day cap is counted
locally against `vxtpl_game.run` (the product counts, the platform never
adjudicates), with a platform-configured `limits["vxtpl.game.runs_per_day"]`
overriding the product default when present - the sales number always wins.

Gating is fail-closed at every layer. The API combines the workspace
entitlement with the live Atlas route directory and rejects a denied model or
skill with 403 before any inference or skill invocation.

## Data

Three contract schemas, applied by `db-init` only (never by the container
entrypoint, never by a migration on boot):

- `vx_provision` - provisioning state and the inbound webhook idempotency ledger
- `local_authz` - product-local membership and role/permission catalogs
- `local_usage` - the usage buffer feeding the C3 flush

The runtime connects as `vxtpl_svc`, a least-privilege role with no DDL rights, no
blanket UPDATE, and a column-level write whitelist. Anchor columns (`id`,
reference keys, `created_at`) are never writable. vxtpl adds no domain schemas of
its own; the three contract names are reserved org-wide.

## What vxtpl deliberately does not do

- **No business domain.** No product catalog, no billing logic, no tenant-facing
  workflow. Those are the copy's job, and inventing a fake one here would make the
  reference harder to read, not easier.
- **No beta tier.** Production only (ADR-002).
- **No multi-region, no horizontal scale.** One stack on one host. The deploy
  chain is correct, not large.
- **No abstraction layer over the platform SDK surface.** vxtpl calls the
  documented HTTP contracts directly so a reader can see the wire, not a wrapper.

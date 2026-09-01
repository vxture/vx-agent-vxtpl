# vxtpl - product definition

## What vxtpl is

vxtpl is a Vxture product with a real business domain: **Emberstorm**, a
bullet-dodging reaction game (its mode: the 20-Second Challenge) whose three
subscription tiers exercise the platform's quota / subscription / entitlement
machinery with real users (ADR-006, spec in `20-challenge-game.md`). `vxtpl`
is the product code - platform plumbing; Emberstorm is the brand
(`BRAND.displayName`). Its second subject matter is the
platform integration surface itself, made visible and exercised in production.

Both roles are deliberate and reinforce each other. vxtpl is the reference
build every new Vxture product is copied from (ADR-001), and a reference nobody
runs drifts from reality within weeks - while a product nobody USES verifies
the integration surface but never the product surface. By deploying vxtpl at
`https://vxtpl.vxture.com`, giving it users, and holding it to the same gates
as any product, both the integration contracts and the tier-gating patterns
stay verified by execution rather than by review.

## Surfaces

The app is ONE screen (owner decision 2026-08-31): the fullscreen command
deck at `/`. Everything a player touches - the game, the daily quota, the
personal record with its trend, the global board, identity and conversion -
lives on that deck, with the record and board as collapsible side-rail
modules. There is no landing page and no separate records/leaderboard pages
(`/challenge` survives only as a redirect for old links).

| Route | What it is |
|-------|-----------|
| `/` | THE app: the deck - seeded runs, daily quota (free), score recording, record + trend module, global-board module, avatar/identity strip |
| `/chat` | Debug/reference: a tier-gated chat turn against Atlas, optionally through a Runos capability |
| `/status` | Debug/reference: live configuration state of every integration channel, presence booleans only |
| `/platform-check` | Debug/reference: read-only connectivity probes against Atlas and Runos |
| `/entitlement-matrix` | Debug/reference: every tier x status combination and its gate/CTA outcome, fully offline |

The debug surfaces are the template's service hatches: routable behind the
deck's avatar menu, never player destinations. Two surfaces are load-bearing.
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
| C1 | OIDC relying party against `accounts.vxture.com` | Sign-in with PKCE (S256), single-use state, nonce verification, Redis-backed opaque session cookie, back-channel logout. Tokens never reach the browser. |
| C2 | `GET /platform/entitlements` | Resolves the caller's subscription tier and quota pools for the active workspace; 45s cache, invalidated by C3, stale-on-error, fail-closed to no-coverage. |
| C3 | Inbound provisioning webhook + `POST /usage/consume` | HMAC-verified (`t=`,`v1=` over raw bytes, +/-300s, rotation slot), idempotent and sequence-ordered; every entitlement-changing delivery evicts the C2 cache. Usage is buffered locally and flushed on the always-200 consume contract (`gated` is information and evicts C2, `replayed`/`event_id` reconcile, non-200 retries), with `end_user_id` attribution and `x-request-id` on every call. |
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
exemplar of a product blank zone filled in: concrete feature keys for three chat
models, four skills, and the game's five `game:*` keys, gated cumulatively
across the five subscription tiers. The *mechanism* - `canUseFeature`,
`minTierFor`, the `hasProductAccess` / `hasDataAccess` / `ctaFor` formulas, and
the value domains imported from `@vxture/shared` - is rigid and shared
org-wide. The *content* of the matrix is vxtpl's, and a copied product replaces
it.

The game adds the quota exemplar: the free tier's 10-runs-a-day cap is counted
locally against `vxtpl_game.run` (the product counts, the platform never
adjudicates), with a platform-configured `limits["vxtpl.game.runs_per_day"]`
overriding the product default when present - the sales number always wins.

Gating is fail-closed at every layer: an unresolvable entitlement denies access
rather than defaulting to a tier, and an ungated model or skill is refused with a
403 at the API before any S2S token is minted.

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

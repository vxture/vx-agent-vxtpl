# vxtpl - product definition

## What vxtpl is

vxtpl is a Vxture product whose domain is the platform integration surface itself.
Where another product would sell knowledge retrieval or geospatial analysis, vxtpl
sells nothing: its subject matter is the correct consumption of the platform, made
visible and exercised in production.

That is a deliberate choice with a practical purpose. vxtpl is also the reference
build every new Vxture product is copied from (ADR-001), and a reference nobody
runs drifts from reality within weeks. By deploying vxtpl at
`https://vxtpl.vxture.com` and holding it to the same gates as any product, the
integration contracts stay verified by execution rather than by review.

## Surfaces

| Route | What it is |
|-------|-----------|
| `/` | Product home; build provenance and entry to the four surfaces |
| `/chat` | A tier-gated chat turn: pick a model and an optional skill, get a reply from Atlas, optionally executed through a Runos capability |
| `/status` | Live configuration state of every integration channel, reported as presence booleans - no secret value ever leaves the server |
| `/platform-check` | Read-only connectivity probes against Atlas and Runos, from a consumer's perspective |
| `/entitlement-matrix` | Every subscription tier x status combination and the gate/CTA outcome it produces, computed fully offline |

`/chat` is the load-bearing one. It is the only surface that exercises the whole
chain in a single user action: session -> workspace -> entitlement -> capability
gate -> S2S token mint -> Atlas call -> optional Runos capability -> usage record.
The other three exist so that when that chain breaks, the failing link is visible
without a debugger.

## Platform contracts consumed

| Channel | Contract | vxtpl's use |
|---------|----------|-------------|
| C1 | OIDC relying party against `accounts.vxture.com` | Sign-in with PKCE (S256), single-use state, nonce verification, Redis-backed opaque session cookie, back-channel logout. Tokens never reach the browser. |
| C2 | `GET /platform/entitlements` | Resolves the caller's subscription tier and quota pools for the active workspace; 45s cache, invalidated by C3, stale-on-error, fail-closed to no-coverage. |
| C3 | Inbound provisioning webhook + `POST /usage/consume` | HMAC-verified (`t=`,`v1=` over raw bytes, +/-300s, rotation slot), idempotent and sequence-ordered; `subscription_changed` evicts the C2 cache. Usage is buffered locally and flushed with 409-terminal semantics. |
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
models and four skills, gated cumulatively across the five subscription tiers.
The *mechanism* - `canUseFeature`, `minTierFor`, the `hasProductAccess` /
`hasDataAccess` / `ctaFor` formulas, and the value domains imported from
`@vxture/shared` - is rigid and shared org-wide. The *content* of the matrix is
vxtpl's, and a copied product replaces it.

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

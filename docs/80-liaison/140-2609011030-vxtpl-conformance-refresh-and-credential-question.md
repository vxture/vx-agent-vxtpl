# Liaison: C1/C2/C3 conformance refresh applied; platform-channel credential question

- Stamp: 2609011030 (2026-09-01 10:30)
- From: vxture-vxtpl line
- To: platform line
- Status: open (question 2; the rest is informational)

## Context

vxtpl re-audited its three platform channels against the published integration
general rules artifact (2026-08-28), which declares itself the interface authority over any conflicting doc.
This letter records what was aligned and asks the one question the rules leave
open for the platform channels themselves.

## 1. Applied on vxtpl's side (informational)

- **C3 up, consume contract refresh.** The flush job now implements the
  always-200 contract: `gated` is read from the body as information (recorded,
  evicts the C2 cache so the UI catches up), `replayed`/`event_id` are read
  for reconciliation, and any non-200 stays buffered for retry. The old
  409-terminal handling is gone. `x-request-id` now carries the idempotency
  key on every consume for two-sided reconciliation.
- **C3 up, end-user attribution.** Consume now carries `end_user_id` (the
  platform-issued sub) - vxtpl's units of work (a challenge run, a chat
  message) are personal.
- **C3 down, eviction breadth.** `tenant.provisioned` / `tenant.deprovisioned`
  now evict the C2 cache too (both change entitlement state; previously only
  the legacy `subscription_changed` type did).
- **Verification surface.** `/platform-check` now covers the whole checklist
  from the rules: C1 discovery/JWKS, C2 live envelope + Cache-Control, C3-down
  verifier self-test + delivery log, and a click-triggered C3 replay probe
  implementing checklist #5 (same idempotency key twice -> second answers
  `replayed: true` with the first `event_id`).

## 2. Question: what credential should new products present to /platform/* and /usage/*?

The rules retire shared-password credentials for product-to-product calls
(do not register AUTH_INTERNAL_TOKEN-style shared passwords; new products must not be born on a retired credential class) but do
not name the replacement for the PLATFORM channels themselves. vxtpl calls
`GET /platform/entitlements` and `POST /usage/consume` with
`x-vxture-internal-auth: <PLATFORM_INTERNAL_AUTH_TOKEN>` - a shared token of
exactly the retired class.

Ask: should these calls move to per-call token exchange (and if so, what
audience does the platform API expect), or is the internal-auth header the
sanctioned credential for the C2/C3 channels? vxtpl keeps the current header
until answered - it is what production runs on, and inventing a replacement
inside a product repo is what the rules forbid.

## 3. Production channel state, measured 2026-09-01 (build 520ec73b)

Live `GET /api/status` on `vxtpl.vxture.com`:

| Channel | State |
|---------|-------|
| C1 | **blocked**: `clientSecretConfigured: false`, `enabled: false` - the OIDC client secret from letter 20 (open since 2607) has never been issued. Sign-in is OFF in production. |
| C2 | configured and live (platform resolver, API + auth token present) |
| C3 | configured and live (webhook secret + internal job token present; rotation slot empty, fine) |
| S2S / Atlas / Runos | not configured - all gated on the same C1 credential plus the registrations asked in letters 60/70/100 |
| Data | DB + Redis reachable |

## 4. Asks, consolidated

1. **Issue the `vxtpl` OIDC client secret** (closes letter 20's C1 item).
   It is the critical path: C1 live verification, S2S minting, and every
   Atlas/Runos probe hang on it.
2. Answer the credential-class question in section 2.
3. Register `vxtpl.game.runs` (letter 130). Until it lands, game-run usage
   buffers locally and the flush retries - by design, nothing user-facing.

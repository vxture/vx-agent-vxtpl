# Liaison request: vxtpl Atlas scope + S2S credential for chat capability verification

- Stamp: 2608130300 (2026-08-13 03:00)
- From: vxture-template line
- To: platform line (owns Atlas, the L1 model-supply gateway)
- Status: open - awaiting platform-line scope decision + credential issuance

## Context

The template line is turning `vxtpl` (the template's own self-deployed demo
instance) into the first live capability-verification product, starting with
a basic chat feature that should call the platform's model gateway (Atlas).

Investigation found:

- Atlas is a separate system from the C1/C2/C3 channels already covered by
  `docs/80-liaison/20-2607211320-vxtpl-platform-credential-request.md` (login /
  entitlement / provisioning) - it is the org's sole LLM egress and inference
  metering entry point, confirmed live at `worker-02:3100`.
- `product_240_repo-template.md`'s product scope table lists only the ten
  governed products (L1 atlas/ontos/runos, L2 arda/karda/terra, L3
  raven/anlan/forge/xuanzhen/...). `vxtpl` is the template's own demo
  instance, not one of those - it currently has **no documented Atlas
  consumption module**, and even for L2 products the S2S-caller module is
  optional, never assumed.
- No Atlas S2S credential exists or has been requested before now
  (`gh secret list` for this repo is empty; even the C1/C2/C3 credentials
  from letter `20` are still open).
- The exact Atlas request/response schema is owned by
  `vxture-atlas/docs/30-design/200-s2s-provider-surface.md`, not available in
  this environment, so the template-side client currently targets a
  best-effort placeholder endpoint (`POST {ATLAS_API_URL}/v1/chat`) pending
  confirmation.

## What the template line has built already (no platform action needed for this part)

A chat module that defaults to a fully offline Mock resolver (deterministic
canned reply, no external call) so the UI, request validation, and route are
verifiable today with zero platform dependency:

- `portals/app/app/chat/` - resolver abstraction (`ChatResolver`), the Mock
  resolver, and an `AtlasChatResolver` gated behind `ATLAS_API_URL` +
  `ATLAS_S2S_TOKEN` (selected only when both are set - same fail-to-mock
  pattern as C2's entitlement resolver).
- `POST /api/chat` and the `/chat` demo page.
- `/api/status` `chat` block reports `resolver: "atlas" | "mock"` plus
  presence booleans for the two env vars (no secret values, same
  no-leak-invariant pattern as the rest of `/api/status`).

## Request (platform line) - two things

### 1. Scope decision

Confirm whether `vxtpl`, as the template's demo/capability-verification
instance, may consume Atlas at all, and if so under what product identity
(e.g. is `vxtpl` treated as its own Atlas consumer, or should chat
verification instead run against a shared sandbox/demo Atlas consumer so it
doesn't need a permanent per-product grant). If the answer is "not
appropriate for vxtpl to consume Atlas directly," say so - the Mock resolver
already satisfies "basic chat feature, capability verified offline" without
it.

### 2. If approved - Atlas S2S credential (mirrors the C2 pattern)

| Field | Value |
|---|---|
| Consumes | `ATLAS_API_URL` (internal-network base, e.g. `http://worker-02:3100` or its tailnet name - not secret) |
| Consumes | `ATLAS_S2S_TOKEN` (S2S auth token scoped to `aud=atlas`, per `product_210_tool-protocol.md`) |
| Also needed | confirmation of the actual chat endpoint path/envelope (`vxture-atlas` `200-s2s-provider-surface.md`), since the template-side client currently guesses `POST {base}/v1/chat` with `{product, messages}` -> `{reply}` |

Deliver: the base URL (can go in this doc/PR - not secret) + the S2S token
(out-of-band, e.g. secrets manager or private channel - never in this doc, a
PR, or a commit, per repo secret hygiene). Template-side: set both in
`/srv/md0/vxtpl/etc/.env` on worker02, restart the app container.

## Acceptance (after scope decision + credential land)

- `/api/status` `chat.resolver` flips from `"mock"` to `"atlas"`.
- A message sent through `/chat` returns a real Atlas-generated reply
  (`mode: "atlas"` in the `/api/chat` response), not the mock echo.
- If the platform line's answer is "not in scope," this letter closes with
  that decision recorded and the Mock resolver remains the permanent chat
  backend for vxtpl.

## Infra reference

vxtpl -> host worker02 / port 3210 / stack_root `/srv/md0/vxtpl` / apex
`vxtpl.vxture.com`. Atlas -> `worker-02:3100` (per platform infra registry).

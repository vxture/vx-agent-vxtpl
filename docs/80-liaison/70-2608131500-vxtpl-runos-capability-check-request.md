# Liaison request: vxtpl Runos scope + S2S credential for capability verification

- Stamp: 2608131500 (2026-08-13 15:00)
- From: vxture-template line
- To: platform line (owns Runos, the L1 commercial capability plane)
- Status: open - awaiting platform-line scope decision + credential issuance

## Context

Same initiative as `docs/80-liaison/60-2608130300-vxtpl-atlas-chat-request.md`:
turning vxtpl into the template's first live capability-verification product.
The platform line shared the Runos interface reference directly alongside the
Atlas one, so this letter mirrors 60's structure for the second L1 platform.

Runos is the commercial capability plane - connectors, skills, executors,
assets - structurally separate from Atlas (models) and from the C1/C2/C3
channels. Per `product_240_repo-template.md`'s product scope table, `vxtpl`
is the template's own demo instance, not one of the ten governed products
(L1 atlas/ontos/runos, L2 arda/karda/terra, L3 raven/anlan/forge/xuanzhen/...),
so it has no documented Runos consumption module either. No Runos S2S
credential exists or has been requested before now.

## What the template line has built already (no platform action needed for this part)

A read-only, agent-usage-perspective verification of Runos's agent-facing
discovery plane - deliberately scoped to *discovery only*, not the full MCP
invoke pipeline (see "Scope limitation" below):

- `portals/app/app/runos/client.ts` - `getRunosClientConfig()` +
  `verifyRunosConnectivity()`, dormant until `RUNOS_API_URL` +
  `RUNOS_S2S_TOKEN` are both set (same fail-to-unconfigured pattern as the
  Atlas client).
- `GET /api/platform-check` and the `/platform-check` demo page: probes both
  Atlas (`GET /v1/models`) and Runos (`GET /.well-known/vxture-tools`) and
  reports configured/ok/detail for each - no tokens or capability quota
  spent either way.

### Scope limitation (by design, not an oversight)

This verification calls `GET /.well-known/vxture-tools` only - it proves S2S
auth works and lists the four fixed MCP tools (`runos_discover` /
`runos_resolve` / `runos_invoke` / `runos_report_outcome`). It does **not**
implement the full `POST /v1/mcp` streamable-HTTP protocol needed to actually
discover or invoke a capability - that requires a real MCP client and is a
separate, larger piece of work than "most basic verification." If actual
capability invocation becomes a requirement, that's a follow-up request.

## Request (platform line) - two things

### 1. Scope decision

Confirm whether `vxtpl` may consume Runos at all for capability verification,
and under what product identity (own consumer vs. a shared sandbox/demo
consumer). If "not appropriate," say so - the `/platform-check` page already
reports "not configured" cleanly without it.

### 2. If approved - Runos S2S credential

| Field | Value |
|---|---|
| Consumes | `RUNOS_API_URL` (internal-network base - not secret) |
| Consumes | `RUNOS_S2S_TOKEN` (an already-issued bearer JWT scoped `aud=runos`, `scope=tool:runos`) |

Deliver: the base URL (can go in this doc/PR - not secret) + the S2S token
(out-of-band, never in this doc, a PR, or a commit). Template-side: set both
in `/srv/md0/vxtpl/etc/.env` on worker02, restart the app container.

## Acceptance (after scope decision + credential land)

- `/api/platform-check` `runos.configured` and `runos.ok` both `true`,
  `detail` lists the four tool names.
- If the platform line's answer is "not in scope," this letter closes with
  that decision recorded and `/platform-check` permanently reports Runos as
  not configured.

## Infra reference

vxtpl -> host worker02 / port 3210 / stack_root `/srv/md0/vxtpl` / apex
`vxtpl.vxture.com`.

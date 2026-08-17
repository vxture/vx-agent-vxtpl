# L1 integration plan (Atlas, Runos)

Where vxtpl stands against the two L1 planes it consumes, what is already true in
code, and what is left. Written after the 2026-08-16/17 contract refresh, in
which both planes shipped breaking changes in response to vxtpl's own questions
(vxture-atlas#198, vxture-runos#116).

## Version pins this plan is written against

| | version | source of truth |
|---|---|---|
| Atlas | v0.16.0 deployed | conforms to product_251 X-1; `/v1/endpoints` live since v0.13.0, `taskId` required since v0.15.0 |
| Runos | v0.8.0 deployed | conforms to product_251 X-1 + ADR-015/016; service-mode S2S live since v0.6.0 |
| Standard | product_251 (L1 API 规范) | the cross-fleet authority both planes conform to |

**Where a doc and the service source disagree, source wins for the wire shape and
the doc wins for which version is live.** That rule earned its place this round:
the English-titled interface artifacts were two releases stale, and reading them
alone would have produced a client that was wrong in three places.

## What is done in code

- **One error vocabulary** (`lib/platform-error.ts`). Both planes now answer
  `{code, message, retryable}` with five unprefixed rejection codes that mean the
  same thing everywhere. vxtpl matches one constant rather than a branch per
  callee - which is the entire point of the unprefixed set.
- **`retryable` comes from the callee.** Never inferred from a status: a
  commercial ceiling can arrive as 429 and must not be retried, and a 501 is in
  the 5xx range but must never be retried at all.
- **One `taskId` per turn**, sent to both planes. Atlas requires it (400 without
  it since v0.15.0) and Runos requires it on every tool call. Using the same
  value is what lets a turn that spent a capability call and model tokens be
  totalled back up as one unit of work; two ids would silently make that
  impossible.
- **The model catalog is now checkable.** `GET /v1/endpoints` answers what vxtpl
  may actually route to, resolved by the same code path a call authorizes
  through. `/platform-check` reconciles the shipped catalog against it and names
  any entry that would 404 - the failure that previously surfaced as a user
  clicking a model in production.
- **Skills never auto-retry.** Every attempt is billed and audited, and the
  operations most worth retrying are the ones that are not idempotent.

## What is left, and who owns it

**Blocking a first live call - platform/operator side:**

1. `OIDC_CLIENT_SECRET` for vxtpl in the host `.env`. One credential unlocks both
   login and every S2S call.
2. Atlas product-endpoint grants for vxtpl. Without one, every call is
   `403 NOT_ENTITLED` regardless of token validity. `chat/default` alone is
   enough to start; `/platform-check` will then report exactly which of the
   shipped catalog entries are live.
3. Workspace coverage. Minting is gated on vxtpl itself holding a subscription or
   provisioned state in the workspace it speaks for - the check is on the CALLER,
   not the callee.
4. `ATLAS_API_URL` and `RUNOS_API_URL` in the host `.env` (base URLs only; the
   port registry holds the allocations).

**Blocking public verification:**

5. The port cutover. The registry reassigned vxtpl and the move is registered but
   not executed. The host `.env` and the edge vhost are one change in two places
   and must move together - the previous port move left the edge pointing at the
   old number and the site answered 502 until someone noticed (liaison letter 50).

**Not blocking:**

6. Runos's production capability catalog. Reported empty, though a first-party
   `runos.code-sandbox` may now be registered - worth re-asking, since it decides
   whether skills can stop reporting `unavailable`. vxtpl's implementation is
   complete either way.
7. `RUNOS_ENTITLEMENT_ENFORCED` is off in production, so no capability grant is
   needed. Revisit if it is turned on.

## Things that will bite the next integrator

Recorded here rather than in a comment, because each cost real time and none of
them announce themselves:

- **A silent failure beats a loud one every time.** The three worst findings this
  round were a `tenantId` that worked until a grant lapsed, a `delegation_token`
  rejected in a way that implicated the callee, and a required field we did not
  send. None produced a signal until the exact moment it mattered.
- **Read the source for shape, the doc for liveness.** Docs lag releases; source
  cannot tell you what is deployed.
- **A catalog you cannot verify will drift, and then be believed.** vxtpl invented
  three endpoint codes and shipped them. The fix was not more care - it was
  asking for an endpoint that makes the assumption checkable.
- **The unprefixed error codes are a contract, not a coincidence.** Branching per
  callee is how multi-provider error handling rots.

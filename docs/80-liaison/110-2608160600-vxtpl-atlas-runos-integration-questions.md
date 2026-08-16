# Liaison note: integration questions filed with the Atlas and Runos lines

- Stamp: 2608160600 (2026-08-16 06:00)
- From: vxture-vxtpl line
- To: Atlas line, Runos line
- Status: open - awaiting answers on both

Batch F connected vxtpl to Atlas and Runos for real (see
`docs/70-workplan/00-index.md`). Verifying our clients against both services'
source turned up one outright contradiction and several questions a product repo
cannot answer for itself. Filed as issues rather than letters, because both are
tracked on the callee's side:

- **vxture-runos#116** - `delegation_token` aud contract, plus five onboarding
  questions
- **vxture-atlas#198** - product-endpoint grant request, plus what is really
  registered in production and why a consumer cannot self-check its catalog

## The one that matters most

Runos's consumption contract documents `delegation_token` as an "end-user
delegation OIDC token", while the gateway verifies it against `aud = "runos"`
and re-asserts the match. An end-user access token is minted with
`aud = <caller client id>` - the OBO exchange itself requires that - so the
documented token can never verify. Anything built to the doc fails 100% of
invocations with `caller_error/invalid_delegation`, and it fails wearing a
capability-fault costume, so the first place a reader looks is the capability and
the grants.

We hit this ourselves and only caught it in review, because Runos's production
capability catalog is empty and the call therefore never reaches invoke today.
Our workaround forwards the minted OBO S2S token (which carries `aud=runos`, the
user's `sub`, and a `jti` - exactly the three fields that code reads); we asked
whether that is the intended shape or whether the implementation is what should
move.

## What is blocking versus what is not

**Blocking a first live call:**

- Atlas product-endpoint grants for vxtpl. Without one, every call is
  `403 GRANT_DENIED` regardless of token validity.
- Which chat endpointCodes actually exist in production. Ours were written
  against a dev seed that declares itself "NOT a deployment artifact".

**Not blocking, but shapes what we build:**

- Runos's production catalog is empty, so skills honestly report "unavailable".
  Our implementation is complete and works the day a capability is registered.
- Runos ADR-013 (service-mode `sub`) ships with their v0.6.0 and decides whether
  any product can run scheduled capability work. Our client needs no change.

## The recurring shape

Both issues carry a version of the same observation, which is worth stating
separately from the individual questions: **the failures that cost us the most
time were the silent ones.** A `tenantId` that is accepted, works while a grant
happens to match, and writes NULL into every tenant rollup meanwhile. A
`delegation_token` rejected in a way that implicates the callee. A catalog of
endpoint codes that cannot be validated at build, deploy, or boot - only when a
user picks that model.

Each is individually small. Together they are the argument for the request in
atlas#198 §3: give a consumer a grant-filtered read of its own entitlements, so
a product can check its assumptions at startup instead of discovering them in
production.

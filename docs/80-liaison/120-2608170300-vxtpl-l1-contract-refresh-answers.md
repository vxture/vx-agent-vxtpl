# Liaison note: answers received from Atlas and Runos, and what vxtpl changed

- Stamp: 2608170300 (2026-08-17 03:00)
- From: vxture-vxtpl line
- To: Atlas line, Runos line, platform line
- Status: closed on vxtpl's side - both issues answered and every change applied;
  the remaining items are operator actions tracked in
  `docs/50-deployment/30-l1-integration-plan.md`

Both lines answered letter 110's issues (vxture-atlas#198, vxture-runos#116) with
substantive work rather than clarification. This note records what came back,
what vxtpl changed, and the one thing worth carrying forward.

## Answered, and fixed on their side

- **Runos: the `delegation_token` contract was wrong in the doc, not the code.**
  Our reading was confirmed: an end-user token can never satisfy `aud=runos`, so
  anything built to the published line failed every invocation. Forwarding the
  minted OBO token is the intended shape, and the doc now says so.
- **Runos went further than asked on our observation 1(c).** We noted the `aud`
  check stops the wrong-token case but not the wrong-caller one. They added two
  assertions (delegation `act.sub` must equal the bearer's, and `mode` must be
  `obo`), which also closed a case we had not seen: an operator token is also
  `aud=runos` with a `sub`, and would have hashed an operator into `end_user_id`.
- **Atlas built `GET /v1/endpoints`.** This was our request 3 and the one we
  argued hardest for. A consumer can now read what it may actually route to,
  resolved through the same code path a call authorizes through - so the catalog
  cannot drift from the call path, which is the failure mode that made the old
  hard-coded list dangerous rather than merely manual.
- **Atlas collapsed the third error envelope and added `retryable` everywhere**,
  and stopped passing upstream vendor codes through as its own.

## What we got wrong, and had to fix

- **`taskId` is required on `/v1/chat`, not optional.** The issue reply described
  it as a new optional field; it has been a hard requirement since Atlas v0.15.0
  and production is v0.16.0. **Every vxtpl chat call would have failed with
  `400 TASK_ID_REQUIRED`.** We now send one task id per turn to both planes -
  which is what the field is for, and means a turn spanning a capability call and
  model tokens totals back up as one unit of work.
- **We were reading stale documents.** The English-titled interface artifacts we
  cited in letter 110 are two releases behind the Chinese-titled set. Three of
  our conclusions came from them and were wrong. The rule we have adopted, and
  recorded: read the service source for the wire shape, the current doc for which
  version is live.
- **Our "five unprefixed rejection codes" was one too confident.** Four are
  normative in product_251; `RATE_LIMITED` is a fleet convention both planes
  implement ahead of a spec amendment. We code all five and say which is which.

## What is still open, and who holds it

Operator actions, unchanged from letter 100 and now the only thing between vxtpl
and a first verified live call: the OIDC client secret, an Atlas
product-endpoint grant, and workspace coverage for the D2 gate. Runos needs no
grant - production does not enforce entitlement.

Separately: **the port registry has reassigned vxtpl and the cutover is not
executed.** The repo now carries the new allocation. The host `.env` and the edge
vhost are one change in two places; moving one without the other is what produced
the 502 in letter 50.

## The thing worth carrying forward

Runos closed with a fair warning: three breaking changes shipped this round with
no deprecation window, on the grounds that they had no consumers to protect, and
**that exemption is now spent because vxtpl exists**. We should expect - and
should ourselves offer - a window from here.

The corollary matters more. Every one of the expensive findings on both sides was
a *silent* failure: a `tenantId` that worked until a grant lapsed, a delegation
token rejected in a way that implicated the callee, a required field nobody was
sending, a catalog nothing could check. None announced itself. Being the first
real consumer is how they were found, and staying deployed is the only way the
next batch gets found the same way.

# ADR-003: S2S tokens are minted per call, never configured

- **Status:** accepted
- **Date:** 2026-08-16

## Context

vxtpl calls three services machine-to-machine: Atlas for inference, Runos for
capability execution, and the platform's own `/platform/*` and `/usage/*`
endpoints. Each needs a service-to-service credential.

The repo modelled that as configuration. `.env.example` carried
`ATLAS_S2S_TOKEN` and `RUNOS_S2S_TOKEN`, each annotated "procure: already-issued
bearer JWT", and the clients read them straight out of the environment. Liaison
letters 60 and 70 asked the platform line to issue those tokens.

Reading the platform's token-exchange implementation shows why that could never
have worked. Platform S2S tokens are minted by an RFC 8693 token exchange with
`TOKEN_EXCHANGE_TTL_SECONDS = 300`, and they are deliberately not refreshable -
the caller re-exchanges on expiry. A token pasted into an env file is valid for
five minutes and returns 401 for the rest of the deployment's life. The design
would have passed one manual smoke test and then failed permanently, in a way
that reads as "Runos is broken" rather than "this was never possible".

The exchange also needs no new credential. It authenticates with the caller's
existing confidential OIDC client - the same `OIDC_CLIENT_ID` /
`OIDC_CLIENT_SECRET` pair vxtpl already holds for the C1 login flow. So the
liaison asks were requesting something that does not exist, while the thing
actually required was already provisioned.

## Decision

vxtpl mints S2S tokens per call and caches them in memory.
`portals/app/app/lib/s2s-token.ts` is the single place that speaks to the token
endpoint. `ATLAS_S2S_TOKEN` and `RUNOS_S2S_TOKEN` are removed; the clients keep
only their base URLs.

Consequences that fall out of the exchange contract, each of which shapes code
elsewhere:

1. **On-behalf-of is the default for a user-initiated call.** A chat turn is
   made by a person, so it mints OBO: the platform reads workspace and subject
   from the presented token, which is what makes the workspace claim
   unforgeable. Runos additionally uses the resulting `sub` as the end-user
   attribution on its audit trail.

   This started as a hard constraint rather than a choice - Runos v0.5.0's guard
   required `sub`, which service-mode tokens do not carry. Runos ADR-013 lifted
   that in their v0.6.0, which is live, so a background path to the capability
   plane now exists. vxtpl has no scheduled capability work today, but the client
   takes the general identity shape, so adding one is a caller-side change only.
2. **Cache keys carry identity.** An OBO token is scoped to one user and one
   workspace. The cache is keyed by audience plus mode plus context, so one
   user's token can never be handed to another's request.
3. **The 30-second margin is not decoration.** The platform edge rate-limits at
   50 requests/second per source IP, and a 300-second token re-minted on every
   request would put a busy page into 429s. Tokens are reused until 30 seconds
   before expiry, which is also enough headroom that a token cannot expire
   mid-flight on a slow inference call.
4. **A 401 from a callee means re-mint once, then fail.** The Atlas client drops
   the cached token and retries a single time. Retrying further would mask a
   genuine authorization problem as latency.
5. **The mint call goes over public HTTPS.** The platform's internal tailnet
   alias serves only `/platform/` and `/usage/`; `/oidc/token` is not routed
   there. So the egress guard must keep its https-anywhere branch open even
   though every subsequent tool call is tailnet-internal.
6. **`invalid_target` means coverage, not a typo.** With a valid audience string
   that error is the D2 gate: vxtpl must itself hold an active subscription or a
   provisioned state in the workspace it is speaking for. It is the first error a
   newly registered product hits, and it is a platform-side action, not a code fix.

## Consequences

- One fewer secret per platform, and the two that remain (`OIDC_CLIENT_SECRET`,
  `PROVISION_WEBHOOK_SECRET`) are ones vxtpl already had.
- Liaison letters 60 and 70 asked for the wrong thing. They stay as written -
  they are dated records - and a new letter states the corrected ask.
- A background path to Runos exists as of their v0.6.0. vxtpl does not use one
  yet; when it needs one, the change is a service-mode identity at the call site,
  not new machinery.
- The C2 entitlement client still uses the older `x-vxture-internal-auth` shared
  header. The platform now dual-accepts a Bearer S2S token with `audience=vxture`
  and intends to retire the shared-secret path. Migrating it is tracked as tech
  debt rather than done here, so that this change stays one decision.

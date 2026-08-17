# Liaison note: vxtpl repositioned as a product-grade exemplar, and a correction to our S2S credential asks

- Stamp: 2608160200 (2026-08-16 02:00)
- From: vxture-vxtpl line
- To: platform line
- Status: open - one correction, one confirmation request, one registration list

## 1. Positioning change (supersedes letter 80)

Letter 80 recorded that the rename to `vxture-vxtpl` left this "still the org's
product-repo template (domain-neutral, no product logic)". That is no longer
true, by decision rather than by drift. Letter 80 stays unedited as the record of
what was true then; this note supersedes its positioning claim.

vxtpl is now a deployed Vxture product **and** the reference build new product
repos are copied from (ADR-001). The two are deliberately the same artifact: a
template nobody runs drifts from the contracts it claims to demonstrate, and this
one had - the repo carried `__PRODUCT_CODE__` placeholders that CI substituted at
image-build time, so the deployed artifact was never the thing in the repository.

Concretely, for your side:

- The `PRODUCT_CODE` repo variable is no longer read by any workflow. `vxtpl` is a
  literal throughout. The variable can be deleted whenever convenient; leaving it
  set is harmless.
- Nothing about the deployed identity changed. Image `ghcr.io/vxture/vxtpl-app`,
  compose project `vxtpl`, containers `vxtpl-app`/`-redis`/`-db`, database
  `vxturebiz_vxtpl_prod`, role `vxtpl_svc`, stack root `/srv/md0/vxtpl`, host port
  3210 - all byte-identical to what runs today. This was a source change, not a
  deployment change.
- New product repos are created by copying this one and running
  `scripts/init/rename-product.mjs <code>`, which rewrites the whole name cascade
  including file and directory names.

## 2. Correction: letters 60 and 70 asked for something that does not exist

Both letters requested "an already-issued bearer JWT" as
`ATLAS_S2S_TOKEN` / `RUNOS_S2S_TOKEN`. We were wrong to ask, and we would like to
withdraw those two asks rather than have them fulfilled.

Reading `bff/auth-bff/src/oidc/token-exchange.service.ts`: S2S tokens are minted
by RFC 8693 exchange with `TOKEN_EXCHANGE_TTL_SECONDS = 300`, explicitly not
refreshable. A token handed to us in an env file would be valid for five minutes
and then fail permanently - and it would fail as "Runos is broken", not as "this
was never possible".

The exchange also needs no new credential: it authenticates with our existing
confidential OIDC client, the same `vxtpl` client_id/secret pair already issued
for C1 login. **So the correct ask is narrower than the original one, not wider.**
We have implemented per-call minting (`portals/app/app/lib/s2s-token.ts`, ADR-003)
and removed both env keys.

Letters 60 and 70 stay unedited; this note corrects them.

## 3. What we now need from you

Nothing new needs to be *created* for the credential itself. What is missing is
registration and coverage:

1. **`OIDC_CLIENT_SECRET` value for `vxtpl`** - still the open ask from letter 20.
   This one secret now unlocks both login and every S2S call.
2. **Confirm the `product_id` backfill.** We read that
   `appoidc.oidc_clients.product_id` must point at the `vxtpl` product row, or
   every exchange answers `400 invalid_client` despite a correct secret. Seeded
   at `seed-catalog.mjs` L1359-1366; please confirm it is applied in production:
   `select p.product_code from appoidc.oidc_clients c join product.products p on p.id = c.product_id where c.client_id = 'vxtpl'`
3. **Workspace coverage (the D2 gate).** vxtpl must itself be provisioned into
   (or hold an active subscription in) any workspace it speaks for, or minting
   returns `400 invalid_target`. We note the platform seed defines no vxtpl plans
   or `plan_components`, so the provisioning leg looks like the workable one.
   Which workspace should we use for a first live verification?
4. **Atlas endpoint grants.** We call by `endpointCode` and our catalog is now
   `chat/cheap`, `chat/default`, `chat/pro` - collapsed from four codes, three of
   which (`chat/quality`, `chat/reasoning`, `chat/frontier`) we had invented and
   which exist nowhere in Atlas. Please create `product_endpoint_grants` rows for
   `vxtpl` on those three, or tell us which subset vxtpl should hold.
5. **Runos capability grants** - only if `RUNOS_ENTITLEMENT_ENFORCED=true` on
   the Runos deployment. If it is off today, say so and we will not chase it.
6. **`ATLAS_API_URL` and `RUNOS_API_URL`** for the host `.env` - base URLs only
   now. We accept the `worker-02:3100` short-hostname form.

## 4. Two things you may want to know from our side

- **Runos calls must be on-behalf-of on v0.5.0.** Service-mode tokens omit `sub`
  entirely and the production guard requires one (`S2S_TOKEN_MISSING_SUB`). We
  have made every Runos call ride a live user session. We note Runos ADR-013 is
  merged-unreleased and lifts this in v0.6.0; our client already takes the
  general identity shape, so we need no change when it ships - but please tell us
  when v0.6.0 reaches production, since it is the difference between "vxtpl can
  run scheduled capability work" and "it cannot".
- **The Runos production catalog is empty**, so `runos_discover` returns nothing
  and our skill invocation will honestly report "unavailable" until a connector
  is registered. Our implementation is complete and will work the day one exists;
  we are not blocked, only unable to demonstrate.

## 5. Still open elsewhere

Letter 50 (edge `vxtpl.vxture.com` 502 after the 3210 cutover) is unchanged and
still blocks any browser-based verification of the login round trip.

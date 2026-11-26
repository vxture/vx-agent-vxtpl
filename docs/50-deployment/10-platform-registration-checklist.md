# Platform-side registration checklist

Platform-line actions that must exist before a product repo can make a real call.
They are code-external: performed in the platform repo and platform consoles, not
here. Authority: `product_240_repo-template.md` section 2.8.

Two columns below: what is already true for **vxtpl**, and what a product copied
from vxtpl has to obtain for itself. Nothing here is optional - an unregistered
product gets a plausible-looking `400 invalid_client` or `400 invalid_target` and
no hint about which of these steps is missing.

## Directory and plan

- [x] **vxtpl** product row in the platform product directory (`product.products`,
      `product_code='vxtpl'`, `status='active'`). Other products can also target
      `audience=vxtpl` because of this row.
- [ ] Plan structure (subscription tiers) seeded for the product. **Not done for
      vxtpl**: the platform seed defines no vxtpl plans or `plan_components`, so
      the subscription leg of the S2S coverage gate cannot be satisfied. The
      workable leg today is provisioning (below).

## OIDC (customer realm)

- [x] **vxtpl** OIDC client registered, realm = customer, status active.
- [ ] `vxtpl-beta` client. **Deliberately not registered** - vxtpl is prod-only
      (ADR-002). A product that turns the beta tier on (ADR-007) registers
      `<code>-beta` before its first `beta-*` tag, since the double client is
      canonical (back-channel logout is a single-URI hard constraint).
- [x] `client_secret_hash` provisioned. **This same client_id/client_secret pair
      is also the S2S credential** (ADR-003) - there is no separate S2S secret to
      request, and asking for one is asking for something that does not exist.
- [ ] `redirect_uri`, `post_logout_redirect_uri`, and `back_channel_logout_uri`
      set on each client.
- [x] Allowed scopes `openid profile email phone`. Nothing needs adding for S2S:
      the exchange grant never reads `allowed_scopes` and derives the minted
      scope from the audience alone.
- [x] **`oidc_clients.product_id` backfilled to the product row.** Easy to miss
      because it is separate from registering the client and registering the
      product, and it is what makes `act.sub` resolve. Without it every token
      exchange answers `400 invalid_client` even with a correct secret. Verify:
      `select p.product_code from appoidc.oidc_clients c join product.products p on p.id = c.product_id where c.client_id = 'vxtpl'`

## Workspace coverage for service tickets

- [ ] For a workspace-bound service ticket, confirm that the workspace has an
      active/trialing subscription or a provisioned state for the calling
      product. Without coverage, exchange returns `400 invalid_target`.
- [ ] For interactive C2, verify that Accounts issues an OBO ticket bound to
      the signed-in user, organization and workspace. An empty entitlement
      can be returned for a workspace without subscription coverage.

## Provisioning webhook (C3)

- [x] **vxtpl** registered in `product_webhooks` with its tailnet delivery
      address (`VXTPL_WEBHOOK_BASE_URL`).
- [x] `VXTPL_PROVISION_WEBHOOK_SECRET` live on the platform side and transported
      to the deploy host (liaison letter 90).
- [ ] Confirm delivery to `/api/webhooks/vxture`, the current workspace's
      acknowledgement and a reconciliation pass.
- [ ] Confirm the registry entries for `vxtpl.chat.messages` and
      `vxtpl.game.runs`, the scheduler for `POST /api/usage/flush`, and the
      original platform event ID returned on replay.

## Provider grants

- [ ] **Atlas route inference.** Set `ATLAS_API_URL` and use Opera to grant the product
  an active chat route. The product reads `GET /v1/model-routes` with the workspace
  OBO ticket and applies the current product tier. Run the sample in
  `/platform-check` and record the selected route, model, request ID and task ID.
  Atlas owns inference metering.
- [ ] **Atlas direct model inference.** In the same workspace, use the designated
  operator to load an Atlas catalog that supplies `modelType` and select a chat model reachable through
  a product route grant or covered by a matching tenant model grant. Run
  the model action in `/platform-check` and record the requested model,
  serving model, request ID and task ID. Atlas authorizes the call.
- [ ] Reload `/platform-check` in the same UTC day and run preflight as the
  same designated operator. Confirm both successful receipts return and
  that used probes are disabled.
- [ ] **Runos capability.** Set `RUNOS_API_URL` and set
  `PLATFORM_DEMO_RUNOS_CAPABILITY_ID=markitdown.document-to-markdown` for the
  designated operator and workspace. Confirm the caller can discover the
  connector and resolve its `convert_to_markdown` read operation. The sample
  sends a fixed inline HTML document and verifies Markdown output and the
  outcome acknowledgement. Record the capability, call ID, task ID and
  acknowledgement. Platform operators manage the grant in the target environment.

## Secrets transport

- [ ] All secret values are owner-transported - never committed, never sent over
      insecure channels. Org-level shared credentials (ACR, tailscale, npm token)
      are configured once at the org and shared to the repo, not duplicated.

## Candidate acceptance

Check the deployed version using `pnpm doctor --stage production --url
https://vxtpl.ruyin.work --expect-version <version>`. Verify Atlas and Runos URL
presence, an active authorized Atlas chat route eligible at the product tier, and the approved read-only Runos
capability in the designated workspace. The product needs
`PLATFORM_DEMO_WORKSPACE_ID`, `PLATFORM_DEMO_SUBJECT`, and
`PLATFORM_DEMO_RUNOS_CAPABILITY_ID` for the metered demonstration.

Use Accounts to sign in as the designated user. Verify the assigned seat, C2
read, provisioning ACK and missed-delivery recovery, then retain the C3 event
ID, both Atlas request IDs, and Runos call ID and outcome acknowledgement. Finish
with logout from another product in the same central session and check the
Vxtpl gate transition.


| Evidence | Validation in Vxtpl | Complete when |
| --- | --- | --- |
| C1 provider, session and OBO | \`/platform-check\` preflight and a live login | Discovery, selected workspace, proper audience and successful return to the requested product route |
| C1 central logout | Sign out in a second product in the same central session | Vxtpl returns to the gate and the session read shows the session is gone |
| C2 admission and entitlement | Check an assigned member, an unassigned member and test subscription states | Admission and denial are distinct from expired subscriptions and unavailable responses |
| C3 delivery and reconciliation | Verify provisioning state, platform delivery ACK, duplicate event and missed-delivery recovery | Compare platform acknowledgement with local state at the same event sequence |
| C3 usage and replay | Run the explicit usage probe and read the platform receipt and quota | The original event ID is returned on replay and workspace quota reflects the real event |
| Atlas route | Authorized route check and inference by `endpointCode` | Nonempty response, requested route, serving model and correlated request ID |
| Atlas model | Live catalog and inference by `modelCode` | Nonempty response, requested and serving models, and correlated request ID |
| Runos | Entitled discovery and explicit read probe | Matching capability and call ID plus acknowledged outcome |

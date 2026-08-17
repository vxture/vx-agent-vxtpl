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
      (ADR-002). A copy that wants a beta tier registers both, since the double
      client is canonical (back-channel logout is a single-URI hard constraint).
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

## Workspace coverage (gates every S2S call)

- [ ] The product must be **provisioned into each workspace it will speak for**,
      or hold an active/trialing subscription there. This is the S2S D2 gate, and
      it checks coverage by the **calling** product - vxtpl calling Atlas for
      workspace W requires *vxtpl* to cover W; Atlas's own coverage is irrelevant.
      Absent, minting fails with `400 invalid_target`.

## Provisioning webhook (C3)

- [x] **vxtpl** registered in `product_webhooks` with its tailnet delivery
      address (`VXTPL_WEBHOOK_BASE_URL`).
- [x] `VXTPL_PROVISION_WEBHOOK_SECRET` live on the platform side and transported
      to the deploy host (liaison letter 90).

## Provider grants

- [ ] **Atlas**: a product-grant per endpoint the product calls -
      `(product_code, endpointCode)`, created by an Atlas operator in opera.
      Without one, every call is `403 GRANT_DENIED` regardless of how valid the
      token is. vxtpl's catalog is `chat/cheap`, `chat/default`, `chat/pro`.
      There is no runtime way to discover or verify this from the product side
      (`GET /v1/models` is not grant-filtered and the endpoint registry is
      operator-only), so it is liaison-maintained: adding a model to
      `chat/catalog.ts` means asking for the endpoint to exist AND be granted.
- [x] **Runos**: not required today. Grants live at
      `POST /commerce/capability-grants` (`subjectType: "product"`, `subjectRef` =
      the product code, the same vocabulary as the token's `act.sub`) and are
      consulted only when the deployment sets `RUNOS_ENTITLEMENT_ENFORCED`, which
      production does not (vxture-runos#116). A product cannot self-grant in any
      case; it is an operator action. Revisit if enforcement is turned on.

## Secrets transport

- [ ] All secret values are owner-transported - never committed, never sent over
      insecure channels. Org-level shared credentials (ACR, tailscale, npm token)
      are configured once at the org and shared to the repo, not duplicated.

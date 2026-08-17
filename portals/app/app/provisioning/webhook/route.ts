import { BRAND } from "@vxtpl/shared/brand";
import { verifySignature, webhookSecrets } from "../lib/verify";
import { handleProvisioning, type ProvisioningEvent } from "../lib/handler";
import { getProvisioningStore } from "../lib/store";
import { getEntitlementResolver } from "../../entitlement/resolver";

// POST /provisioning/webhook (product_200 section 4, 080-rp section 4). Verify
// over RAW bytes first (401 on failure / stale timestamp), then hand to the
// idempotent + ordered handler. A processing error returns 500 so the platform
// retries; a valid-but-duplicate/stale event still acks 2xx.
export const dynamic = "force-dynamic";

// The product this webhook accepts events for. BRAND, never OIDC_CLIENT_ID: the
// beta client is `vxtpl-beta` while the product code stays `vxtpl`, so deriving
// it from the client id would make a beta stack reject every event as
// wrong-product.
function productCode(): string {
  return BRAND.productCode;
}

/**
 * Evict the C2 cache for a workspace whose subscription changed.
 *
 * Deliberately swallowing: this runs inside a webhook whose contract is "2xx
 * means recorded". Constructing the entitlement resolver can throw (a deployed
 * stage with no platform config refuses the mock resolver), and letting that
 * escape would turn a correctly-verified, correctly-recorded delivery into a
 * 500 - which the platform retries forever, on an event that already succeeded.
 * A missed eviction costs at most 45 seconds of stale tier; a retry storm costs
 * more.
 */
function evictEntitlement(workspaceId: string): void {
  try {
    getEntitlementResolver().invalidate(workspaceId);
  } catch (err) {
    console.error(`[provisioning] entitlement cache eviction failed for ${workspaceId}:`, err);
  }
}

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text(); // raw body - required for HMAC, do not re-serialize
  const sig = req.headers.get("x-vxture-signature");
  if (!verifySignature(raw, sig, webhookSecrets())) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const deliveryId = req.headers.get("x-vxture-delivery") ?? String(payload.id ?? "");
  if (!deliveryId) return new Response("missing delivery id", { status: 400 });

  const event: ProvisioningEvent = {
    id: deliveryId,
    type: String(payload.type ?? ""),
    occurred_at: typeof payload.occurred_at === "number" ? payload.occurred_at : undefined,
    seq: typeof payload.seq === "number" ? payload.seq : 0,
    workspace_id: String(payload.workspace_id ?? ""),
    tenant_id: typeof payload.tenant_id === "string" ? payload.tenant_id : undefined,
    application: String(payload.application ?? ""),
    plan: typeof payload.plan === "string" ? payload.plan : null,
    data: payload.data,
  };

  try {
    await handleProvisioning(event, {
      store: getProvisioningStore(),
      product: productCode(),
      onSubscriptionChanged: evictEntitlement,
    });
  } catch {
    return new Response("processing error", { status: 500 }); // platform will retry
  }
  return new Response("", { status: 200 });
}

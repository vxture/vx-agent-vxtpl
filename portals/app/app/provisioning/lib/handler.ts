import type { ProvisioningStore } from "./store";

// Provisioning event handling (product_200 section 4, 080-rp section 4). The
// platform guarantees at-least-once only, so duplicate + out-of-order delivery
// WILL happen; the handler is idempotent + ordered. Business-space init must be
// re-entrant; deprovision archives (never hard-deletes).

export interface ProvisioningEvent {
  id: string; // = X-Vxture-Delivery; idempotency key
  // The LIVE word list (integration general rules, C3 webhook) is exactly
  // tenant.provisioned | tenant.deprovisioned. The other cases below are kept
  // for forward/backward tolerance: an unknown type records its delivery and
  // takes no action, which is the spec's required posture.
  type: string;
  occurred_at?: number;
  seq: number; // per (workspace, product), monotonic
  workspace_id: string;
  tenant_id?: string;
  application: string; // = product_code
  plan?: string | null;
  data?: unknown;
}

export interface HandleResult {
  ok: true;
  handled: boolean;
  reason?: "wrong-product" | "duplicate" | "stale" | "processed";
}

export interface HandlerDeps {
  store: ProvisioningStore;
  product: string;
  onSubscriptionChanged?: (workspaceId: string) => void; // C2 cache evict
  onProvisioned?: (workspaceId: string) => Promise<void> | void; // re-entrant init
}

export async function handleProvisioning(
  event: ProvisioningEvent,
  deps: HandlerDeps,
): Promise<HandleResult> {
  // Reject events addressed to another product.
  if (event.application !== deps.product) {
    return { ok: true, handled: false, reason: "wrong-product" };
  }

  // Idempotency: a repeated delivery must not re-run side effects.
  if (await deps.store.isDelivered(event.id)) {
    return { ok: true, handled: false, reason: "duplicate" };
  }

  // Ordering: ignore stale/replayed seq (but still ack 2xx at the route).
  const lastSeq = await deps.store.getLastSeq(event.workspace_id, deps.product);
  if (event.seq <= lastSeq) {
    return { ok: true, handled: false, reason: "stale" };
  }

  switch (event.type) {
    case "tenant.provisioned":
      await deps.store.upsertInstance(event.workspace_id, deps.product, "provisioned");
      await deps.onProvisioned?.(event.workspace_id);
      // (De)provisioning IS an entitlement change - it is what the C2 cache's
      // "invalidate for second-level freshness" exists for. Evicting here is
      // what turns a 45s TTL into a one-click catch-up after purchase.
      deps.onSubscriptionChanged?.(event.workspace_id);
      break;
    case "tenant.deprovisioned":
      // Archive, not hard-delete (080-rp section 4 / product_240 section 6#21).
      await deps.store.upsertInstance(event.workspace_id, deps.product, "deprovisioned");
      deps.onSubscriptionChanged?.(event.workspace_id);
      break;
    case "subscription_changed":
      deps.onSubscriptionChanged?.(event.workspace_id);
      break;
    case "grant.invalidated":
      // vxtpl owns no per-grant assets to re-scope, so recording the delivery
      // (which the caller already did) is the whole correct response. A product
      // that hands out asset-level grants re-scopes them here.
      break;
    default:
      // Unknown event: record delivery so retries stop, take no action.
      break;
  }

  await deps.store.markDelivered(event.id, { type: event.type, result: "processed" });
  await deps.store.setSeq(event.workspace_id, deps.product, event.seq);
  return { ok: true, handled: true, reason: "processed" };
}

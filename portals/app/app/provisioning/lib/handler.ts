import type { ProvisioningChange, ProvisioningStatus, ProvisioningStore } from "./store";

export interface ProvisioningEvent {
  id: string;
  type: string;
  occurred_at?: number;
  seq: number;
  workspace_id: string;
  tenant_id?: string;
  application: string;
  plan?: string | null;
  data?: unknown;
}

export interface HandleResult {
  ok: true;
  handled: boolean;
  reason: "wrong-product" | "duplicate" | "stale" | "processed";
  change?: ProvisioningChange;
}

export interface HandlerDeps {
  store: ProvisioningStore;
  product: string;
  onSubscriptionChanged?: (workspaceId: string) => Promise<void> | void;
  onProvisioned?: (workspaceId: string) => Promise<void> | void;
}

export async function handleProvisioning(event: ProvisioningEvent, deps: HandlerDeps): Promise<HandleResult> {
  if (event.application !== deps.product) return { ok: true, handled: false, reason: "wrong-product" };
  const status: ProvisioningStatus | undefined = event.type === "tenant.provisioned" ? "provisioned"
    : event.type === "tenant.deprovisioned" ? "deprovisioned" : undefined;
  const change = { workspaceId: event.workspace_id, product: deps.product, seq: event.seq, type: event.type, deliveryId: event.id, status };
  const result = await deps.store.apply(change, status === "provisioned" ? () => deps.onProvisioned?.(event.workspace_id) : undefined);
  if (result !== "stale" && (status || event.type === "subscription_changed")) {
    await deps.onSubscriptionChanged?.(event.workspace_id);
  }
  return { ok: true, handled: result === "processed", reason: result, change };
}

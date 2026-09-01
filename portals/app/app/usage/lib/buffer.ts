import { getUsageStore, type UsageStore } from "./store";

// Record a COUNTER usage event into the local buffer (product_200 section 4.1).
// The product never adjudicates quota - it only buffers, and an async flush job
// reports to the platform consume service (the single writer). idempotency_key is
// mandatory (defeats replay / double-count).

export interface UsageEvent {
  workspaceId: string;
  metric: string;
  amount: number;
  idempotencyKey: string;
  /** Optional end-user attribution (consume end_user_id) - vxtpl's units of
   * work are personal, so callers that know the sub pass it. */
  endUserId?: string;
}

export async function recordUsage(
  event: UsageEvent,
  store: UsageStore = getUsageStore(),
): Promise<void> {
  if (!event.idempotencyKey) throw new Error("idempotency_key is required");
  if (!(event.amount > 0)) throw new Error("amount must be positive");
  await store.record({
    workspaceId: event.workspaceId,
    metric: event.metric,
    amount: event.amount,
    idempotencyKey: event.idempotencyKey,
    endUserId: event.endUserId ?? null,
  });
}

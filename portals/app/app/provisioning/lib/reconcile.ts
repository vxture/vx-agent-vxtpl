/**
 * Repairs local provisioning state and retries missing acknowledgements.
 * @package @vxtpl/app
 * @layer Application
 * @category Provisioning
 * @author AI-Generated
 * @date 2026-11-26
 */

import { randomUUID } from "node:crypto";
import { BRAND } from "@vxtpl/shared/brand";
import { acquireRefresh, releaseRefresh } from "../../auth/lib/session-store";
import { invalidateWorkspaceEntitlement } from "../../entitlement/platform-resolver";
import { isDeployedStage } from "../../lib/deploy-stage";
import { prismaEnabled } from "../../lib/db";
import { provisioningClient } from "./platform-client";
import { getProvisioningStore, type ProvisioningChange, type ProvisioningStore } from "./store";

type Client = ReturnType<typeof provisioningClient>;

export async function acknowledgeProvisioned(store: ProvisioningStore, client: Client, change: ProvisioningChange) {
  if (change.status !== "provisioned" || await store.hasAcknowledgement(change) || !await store.isCurrentProvisioned(change)) {
    return false;
  }
  await client.acknowledge(change);
  await store.recordAcknowledgement(change);
  return true;
}

export async function reconcileProvisioning(client: Client, store: ProvisioningStore) {
  const result = { applied: 0, acknowledged: 0, deferred: 0 };
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await client.list(cursor);
    for (const change of page.items) {
      if (change === null) continue;
      // The platform snapshot has already committed. If eviction fails, keep
      // the prior local version so the next reconciliation retries this row.
      const outcome = await store.apply(change, () => invalidateWorkspaceEntitlement(change.workspaceId));
      if (outcome === "processed") result.applied++;
      try {
        if (await acknowledgeProvisioned(store, client, change)) result.acknowledged++;
      } catch {
        result.deferred++;
      }
    }
    cursor = page.nextCursor;
    if (cursor !== null) {
      if (seen.has(cursor)) throw new Error("Repeated platform provisioning cursor");
      seen.add(cursor);
    }
  } while (cursor !== null);
  return result;
}

export async function runProvisioningReconciliation() {
  const baseUrl = process.env.PLATFORM_API_URL;
  if (!baseUrl || !prismaEnabled()) return null;
  const owner = randomUUID();
  const lock = "provisioning-reconciliation";
  const clientId = process.env.OIDC_CLIENT_ID ?? BRAND.productCode;
  if (!await acquireRefresh(clientId, lock, owner, 300_000)) return null;
  try {
    return await reconcileProvisioning(provisioningClient(baseUrl), getProvisioningStore());
  } finally {
    await releaseRefresh(clientId, lock, owner).catch(() => undefined);
  }
}

const RECONCILIATION_INTERVAL_MS = 15 * 60 * 1000;
let reconciliationStarted = false;

export function startProvisioningReconciliation(): void {
  if (reconciliationStarted || !isDeployedStage() || !process.env.PLATFORM_API_URL || !prismaEnabled()) return;
  reconciliationStarted = true;
  async function tick() {
    try {
      const result = await runProvisioningReconciliation();
      if (result?.deferred) console.warn("[provisioning] acknowledgements pending:", result.deferred);
    } catch {
      console.warn("[provisioning] reconciliation will retry on the next run");
    } finally {
      setTimeout(tick, RECONCILIATION_INTERVAL_MS).unref();
    }
  }
  setTimeout(tick, 0).unref();
}

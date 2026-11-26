/**
 * Delivers buffered product counter usage with a workspace-bound service ticket.
 * @package @vxtpl/app
 * @layer Application
 * @category Usage
 * @author AI-Generated
 * @date 2026-11-26
 */

import { BRAND } from "@vxtpl/shared/brand";
import { getUsageStore, type UsageRow, type UsageStore } from "./store";
import { invalidateWorkspaceEntitlement } from "../../entitlement/platform-resolver";
import { assertInternalTarget } from "../../lib/internal-target";
import { invalidateS2SToken, mintS2S, PLATFORM_AUDIENCE } from "../../lib/s2s-token";

// ============================================================================
// Receipts and batch results
// ============================================================================

export interface ConsumeBody {
  gated: boolean;
  replayed?: boolean;
  event_id: string;
}

export interface ConsumeResult {
  status: number;
  body?: ConsumeBody;
}
export type ConsumeFn = (row: UsageRow) => Promise<ConsumeResult>;

export interface FlushOptions {
  store?: UsageStore;
  consume?: ConsumeFn;
  invalidate?: (workspaceId: string) => Promise<void>;
  batchSize?: number;
}

export interface FlushSummary {
  scanned: number;
  flushed: number;
  gated: number; // subset of flushed: recorded, but the pool did not cover it
  replayed: number; // subset of flushed: idempotent redo of an earlier event
  retried: number;
  skipped?: boolean;
}

// ============================================================================
// Buffered delivery
// ============================================================================

/**
 * Reports buffered usage in order and clears rows with a verified receipt.
 * @param opts - Store, transport and cache options for this batch.
 * @returns Delivery counts; unconfirmed rows remain available for replay.
 */
export async function flushUsage(opts: FlushOptions = {}): Promise<FlushSummary> {
  const store = opts.store ?? getUsageStore();
  const baseUrl = process.env.PLATFORM_API_URL;
  const consume = opts.consume ?? (baseUrl ? makePlatformConsume(baseUrl) : null);
  if (!consume) return { scanned: 0, flushed: 0, gated: 0, replayed: 0, retried: 0, skipped: true };

  const rows = await store.unflushed(opts.batchSize ?? 50);
  const done: string[] = [];
  let flushed = 0;
  let gated = 0;
  let replayed = 0;
  let retried = 0;

  for (const row of rows) {
    try {
      const res = await consume(row);
      if (res.status !== 200 || !isConsumeReceipt(res.body)) {
        retried++;
        continue;
      }
      // A replay may report different coverage flags. Every confirmed receipt
      // clears the snapshot so an interrupted gated delivery can still evict it.
      await (opts.invalidate ?? invalidateWorkspaceEntitlement)(row.workspaceId);
      done.push(row.idempotencyKey);
      flushed++;
      if (res.body.replayed === true) replayed++;
      if (res.body.gated) gated++;
    } catch {
      retried++;
    }
  }
  await store.markFlushed(done);
  return { scanned: rows.length, flushed, gated, replayed, retried };
}

function isConsumeReceipt(body: unknown): body is ConsumeBody {
  if (!body || typeof body !== "object") return false;
  const receipt = body as Partial<ConsumeBody>;
  return typeof receipt.event_id === "string" && receipt.event_id.trim().length > 0 &&
    typeof receipt.gated === "boolean" &&
    (receipt.replayed === undefined || typeof receipt.replayed === "boolean");
}

/**
 * Builds the product's C3 client used by the worker and replay probe.
 * @param baseUrl - Internal platform API base URL.
 * @returns A caller that uses a workspace-bound service ticket for each row.
 */
export function makePlatformConsume(baseUrl: string): ConsumeFn {
  return async (row) => {
    const url = assertInternalTarget(`${baseUrl.replace(/\/$/, "")}/usage/consume`);
    const scope = { workspaceId: row.workspaceId };
    const { claims, token } = await mintS2S(PLATFORM_AUDIENCE, scope);
    if (claims.aud !== PLATFORM_AUDIENCE || claims.act?.sub !== BRAND.productCode ||
        claims.mode !== "service" || claims.scope !== "tool:vxture" ||
        claims.workspace_id !== row.workspaceId || claims.sub !== undefined) {
      throw new Error("Invalid product usage ticket scope");
    }
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
        "x-request-id": row.idempotencyKey,
      },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        workspace_id: row.workspaceId,
        product: BRAND.productCode,
        metric: row.metric,
        amount: row.amount,
        idempotency_key: row.idempotencyKey,
        ...(row.endUserId ? { end_user_id: row.endUserId } : {}),
      }),
      cache: "no-store",
    });
    if (res.status === 401) invalidateS2SToken(PLATFORM_AUDIENCE, scope);
    if (res.status !== 200) return { status: res.status };
    const body: unknown = await res.json().catch(() => undefined);
    return isConsumeReceipt(body) ? { status: 200, body } : { status: 200 };
  };
}

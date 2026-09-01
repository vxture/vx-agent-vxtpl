import { getUsageStore, type UsageRow, type UsageStore } from "./store";
import { getPlatformClientConfig, type PlatformClientConfig } from "../../entitlement/platform-client";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { assertInternalTarget } from "../../lib/internal-target";

// Async flush job: drain buffered counter usage and report to the platform
// consume service (the single writer).
//
// Contract per the integration general rules (C3 usage - the
// authoritative interface spec, 2026-08-28): consume is ALWAYS 200, including
// when the quota did not cover the call. `gated: true` in the BODY is
// information, not an instruction - the platform records, it does not
// adjudicate. An idempotent replay answers `replayed: true` with the ORIGINAL
// `event_id`, which is what makes reconciliation possible. The old 409-gated
// shape this file used to handle is retired; any non-200 now means "not
// recorded yet" and the row stays buffered for retry.

export interface ConsumeBody {
  gated?: boolean;
  reason?: string;
  consumed?: number;
  remaining_total?: number;
  replayed?: boolean;
  event_id?: string;
}

export interface ConsumeResult {
  status: number;
  body?: ConsumeBody;
}
export type ConsumeFn = (row: UsageRow) => Promise<ConsumeResult>;

export interface FlushOptions {
  store?: UsageStore;
  consume?: ConsumeFn;
  onGated?: (workspaceId: string) => void;
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

export async function flushUsage(opts: FlushOptions = {}): Promise<FlushSummary> {
  const store = opts.store ?? getUsageStore();
  const consume = opts.consume ?? defaultConsume();
  if (!consume) return { scanned: 0, flushed: 0, gated: 0, replayed: 0, retried: 0, skipped: true };

  const rows = await store.unflushed(opts.batchSize ?? 50);
  const done: string[] = [];
  let flushed = 0;
  let gated = 0;
  let replayed = 0;
  let retried = 0;

  for (const row of rows) {
    let res: ConsumeResult;
    try {
      res = await consume(row);
    } catch {
      retried++;
      continue; // stays buffered
    }
    if (res.status === 200) {
      done.push(row.idempotencyKey);
      flushed++;
      if (res.body?.replayed === true) replayed++;
      if (res.body?.gated === true) {
        // Recorded but not covered: refresh entitlement so the UI's quota view
        // catches up within a click instead of a TTL.
        gated++;
        (opts.onGated ?? ((ws: string) => getEntitlementResolver().invalidate(ws)))(row.workspaceId);
      }
    } else {
      retried++; // 4xx/5xx -> not recorded, stays buffered
    }
  }
  await store.markFlushed(done);
  return { scanned: rows.length, flushed, gated, replayed, retried };
}

/**
 * The platform consume caller. Exported so the platform-check C3 replay probe
 * can exercise the REAL wire path (same body, same headers) rather than a
 * lookalike. `x-request-id` carries the idempotency key - the spec lands it
 * next to the event for two-sided reconciliation, and the idempotency key is
 * the one id both sides already share.
 */
export function makePlatformConsume(cfg: PlatformClientConfig): ConsumeFn {
  return async (row) => {
    const url = assertInternalTarget(`${cfg.baseUrl.replace(/\/$/, "")}/usage/consume`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vxture-internal-auth": cfg.authToken,
        "x-request-id": row.idempotencyKey,
      },
      body: JSON.stringify({
        workspace_id: row.workspaceId,
        product: cfg.product,
        metric: row.metric,
        amount: row.amount,
        idempotency_key: row.idempotencyKey,
        ...(row.endUserId ? { end_user_id: row.endUserId } : {}),
      }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => undefined)) as ConsumeBody | undefined;
    return { status: res.status, body };
  };
}

/** Consume caller from env config, or null when the platform is not configured (offline). */
function defaultConsume(): ConsumeFn | null {
  const cfg = getPlatformClientConfig();
  if (!cfg) return null;
  return makePlatformConsume(cfg);
}

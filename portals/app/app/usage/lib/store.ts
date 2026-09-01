// Local usage buffer port (local_usage.raw). Only COUNTER metrics are buffered
// here; gauge is a no-buffer direct PUT and caps are counted locally. In-memory
// on the offline path; Prisma-backed over local_usage when DATABASE_URL is set.
import { prismaEnabled } from "../../lib/db";
import { PrismaUsageStore } from "./prisma-store";

export interface UsageRow {
  workspaceId: string;
  metric: string; // must hit a platform metric registry key
  amount: number;
  idempotencyKey: string; // forced; replay = no-op
  endUserId?: string | null; // optional per-user attribution (consume end_user_id)
  flushed: boolean;
}

export interface UsageStore {
  record(row: Omit<UsageRow, "flushed">): Promise<void>;
  unflushed(limit: number): Promise<UsageRow[]>;
  markFlushed(idempotencyKeys: string[]): Promise<void>;
}

export class InMemoryUsageStore implements UsageStore {
  private rows = new Map<string, UsageRow>();

  async record(row: Omit<UsageRow, "flushed">): Promise<void> {
    // Upsert by idempotency key: a replay must not double-count.
    if (!this.rows.has(row.idempotencyKey)) {
      this.rows.set(row.idempotencyKey, { ...row, flushed: false });
    }
  }
  async unflushed(limit: number): Promise<UsageRow[]> {
    const out: UsageRow[] = [];
    for (const r of this.rows.values()) {
      if (!r.flushed) out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  }
  async markFlushed(keys: string[]): Promise<void> {
    for (const k of keys) {
      const r = this.rows.get(k);
      if (r) r.flushed = true;
    }
  }
}

// globalThis, not module scope - see provisioning/lib/store.ts for why (per-
// route bundles would give the recorder and the flusher different buffers).
interface StoreGlobal {
  __vxtplUsageStore?: { override: UsageStore | null; memo: UsageStore | null };
}

function slot(): { override: UsageStore | null; memo: UsageStore | null } {
  const g = globalThis as StoreGlobal;
  g.__vxtplUsageStore ??= { override: null, memo: null };
  return g.__vxtplUsageStore;
}

export function getUsageStore(): UsageStore {
  const s = slot();
  if (s.override) return s.override;
  if (s.memo) return s.memo;
  s.memo = prismaEnabled() ? new PrismaUsageStore() : new InMemoryUsageStore();
  return s.memo;
}
export function setUsageStore(next: UsageStore | null): void {
  const s = slot();
  s.override = next;
  s.memo = null;
}

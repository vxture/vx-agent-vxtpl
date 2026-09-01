import type { UsageStore, UsageRow } from "./store";
import { getPrismaClient } from "../../lib/db";

// Prisma-backed UsageStore over local_usage.raw. Used when DATABASE_URL is set.

export class PrismaUsageStore implements UsageStore {
  async record(row: Omit<UsageRow, "flushed">): Promise<void> {
    const p = await getPrismaClient();
    // Upsert on the unique idempotency key; a replay is a no-op (empty update).
    await p.raw.upsert({
      where: { idempotencyKey: row.idempotencyKey },
      create: {
        workspaceId: row.workspaceId,
        metric: row.metric,
        amount: BigInt(row.amount),
        idempotencyKey: row.idempotencyKey,
        endUserId: row.endUserId ?? null,
      },
      update: {},
    });
  }

  async unflushed(limit: number): Promise<UsageRow[]> {
    const p = await getPrismaClient();
    const rows = await p.raw.findMany({ where: { flushed: false }, take: limit });
    return rows.map((r) => ({
      workspaceId: r.workspaceId,
      metric: r.metric,
      amount: Number(r.amount),
      idempotencyKey: r.idempotencyKey,
      endUserId: r.endUserId,
      flushed: r.flushed,
    }));
  }

  async markFlushed(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const p = await getPrismaClient();
    await p.raw.updateMany({ where: { idempotencyKey: { in: keys } }, data: { flushed: true } });
  }
}

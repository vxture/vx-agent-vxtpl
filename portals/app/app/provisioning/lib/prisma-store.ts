import type { ProvisioningStore, DeliveryMeta, DeliveryRecord } from "./store";
import { getPrismaClient } from "../../lib/db";

// Prisma-backed ProvisioningStore over the vx_provision schema. Used when
// DATABASE_URL is set; @prisma/client loads lazily via getPrismaClient().

export class PrismaProvisioningStore implements ProvisioningStore {
  async isDelivered(id: string): Promise<boolean> {
    const p = await getPrismaClient();
    return (await p.webhookDelivery.count({ where: { deliveryId: id } })) > 0;
  }

  async markDelivered(id: string, meta?: DeliveryMeta): Promise<void> {
    const p = await getPrismaClient();
    await p.webhookDelivery.create({
      data: { deliveryId: id, type: meta?.type ?? "unknown", result: meta?.result ?? "processed" },
    });
  }

  async recentDeliveries(limit: number): Promise<DeliveryRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.webhookDelivery.findMany({ orderBy: { createdAt: "desc" }, take: limit });
    return rows.map((r) => ({ deliveryId: r.deliveryId, type: r.type, result: r.result, at: r.createdAt }));
  }

  async getLastSeq(workspaceId: string, product: string): Promise<number> {
    const p = await getPrismaClient();
    const row = await p.provisionSeq.findUnique({
      where: { workspaceId_productCode: { workspaceId, productCode: product } },
    });
    return row ? Number(row.lastSeq) : -1;
  }

  async setSeq(workspaceId: string, product: string, seq: number): Promise<void> {
    const p = await getPrismaClient();
    await p.provisionSeq.upsert({
      where: { workspaceId_productCode: { workspaceId, productCode: product } },
      create: { workspaceId, productCode: product, lastSeq: BigInt(seq) },
      update: { lastSeq: BigInt(seq), updatedAt: new Date() },
    });
  }

  async upsertInstance(workspaceId: string, product: string, status: string): Promise<void> {
    const p = await getPrismaClient();
    await p.appInstance.upsert({
      where: { workspaceId_productCode: { workspaceId, productCode: product } },
      create: { workspaceId, productCode: product, status },
      update: { status, updatedAt: new Date() },
    });
  }
}

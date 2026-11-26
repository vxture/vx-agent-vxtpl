import { acknowledgementKey, type ApplyResult, type ProvisioningChange, type ProvisioningStore } from "./store";
import { getPrismaClient } from "../../lib/db";

export class PrismaProvisioningStore implements ProvisioningStore {
  async apply(change: ProvisioningChange, initialize?: () => Promise<void> | void): Promise<ApplyResult> {
    const db = await getPrismaClient();
    const scope = { workspaceId: change.workspaceId, productCode: change.product };
    const seq = BigInt(change.seq);
    return db.$transaction(async (tx) => {
      if (change.deliveryId) {
        const delivery = await tx.webhookDelivery.createMany({
          data: { deliveryId: change.deliveryId, type: change.type, result: "processed" },
          skipDuplicates: true,
        });
        if (!delivery.count) return "duplicate";
      }
      if (!change.status) return "processed";
      // A conditional version update is serialized by the unique workspace row.
      const inserted = await tx.provisionSeq.createMany({ data: { ...scope, lastSeq: seq }, skipDuplicates: true });
      if (!inserted.count) {
        const updated = await tx.provisionSeq.updateMany({
          where: { ...scope, lastSeq: { lt: seq } }, data: { lastSeq: seq },
        });
        if (!updated.count) return "stale";
      }
      if (change.status) {
        await tx.appInstance.upsert({
          where: { workspaceId_productCode: scope },
          create: { ...scope, status: change.status },
          update: { status: change.status },
        });
      }
      await initialize?.();
      return "processed";
    });
  }

  async instanceStatus(workspaceId: string, product: string): Promise<string | null> {
    const db = await getPrismaClient();
    const instance = await db.appInstance.findUnique({
      where: { workspaceId_productCode: { workspaceId, productCode: product } },
      select: { status: true },
    });
    return instance?.status ?? null;
  }

  async isCurrentProvisioned(change: ProvisioningChange): Promise<boolean> {
    const db = await getPrismaClient();
    const rows = await db.$queryRaw<{ current: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM vx_provision.provision_seq seq
        JOIN vx_provision.app_instance instance USING (workspace_id, product_code)
        WHERE seq.workspace_id = ${change.workspaceId}::uuid AND seq.product_code = ${change.product}
          AND seq.last_seq = ${BigInt(change.seq)} AND instance.status = 'provisioned'
      ) AS "current"
    `;
    return rows[0]?.current === true;
  }

  async hasAcknowledgement(change: ProvisioningChange): Promise<boolean> {
    const db = await getPrismaClient();
    return await db.webhookDelivery.count({ where: { deliveryId: acknowledgementKey(change) } }) > 0;
  }

  async recordAcknowledgement(change: ProvisioningChange): Promise<void> {
    const db = await getPrismaClient();
    await db.webhookDelivery.createMany({
      data: { deliveryId: acknowledgementKey(change), type: "provisioning.ack", result: "processed" },
      skipDuplicates: true,
    });
  }
}

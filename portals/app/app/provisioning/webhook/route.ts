import { BRAND } from "@vxtpl/shared/brand";
import { verifySignature, webhookSecrets } from "../lib/verify";
import { handleProvisioning } from "../lib/handler";
import { getProvisioningStore } from "../lib/store";
import { isWorkspaceUuid, provisioningClient } from "../lib/platform-client";
import { acknowledgeProvisioned } from "../lib/reconcile";
import { invalidateWorkspaceEntitlement } from "../../entitlement/platform-resolver";
import { prismaEnabled } from "../../lib/db";
import { isDeployedStage } from "../../lib/deploy-stage";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-vxture-signature"), webhookSecrets())) {
    return new Response("invalid signature", { status: 401 });
  }
  let payload: Record<string, unknown> | null;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return new Response("bad json", { status: 400 });
  const { id, type, seq, workspace_id, application } = payload;
  const delivery = req.headers.get("x-vxture-delivery");
  const isLifecycle = type === "tenant.provisioned" || type === "tenant.deprovisioned";
  const validSeq = typeof seq === "number" && Number.isSafeInteger(seq) && seq >= 0;
  if (typeof id !== "string" || !id || id.length > 128 || id.startsWith("ack:") ||
      (delivery !== null && delivery !== id) || typeof type !== "string" || !type || type.length > 64 ||
      typeof application !== "string" || !isWorkspaceUuid(workspace_id) ||
      (isLifecycle && !validSeq)) {
    return new Response("invalid provisioning event", { status: 400 });
  }
  if (application !== BRAND.productCode) return new Response(null, { status: 204 });
  if (!prismaEnabled() && isDeployedStage()) return new Response(null, { status: 503 });

  const store = getProvisioningStore();
  try {
    const result = await handleProvisioning({ id, type, seq: validSeq ? seq : 0, workspace_id, application }, {
      store, product: BRAND.productCode, onSubscriptionChanged: invalidateWorkspaceEntitlement,
    });
    if (result.change?.status === "provisioned" && result.reason !== "stale" && prismaEnabled()) {
      const baseUrl = process.env.PLATFORM_API_URL;
      if (!baseUrl) return new Response(null, { status: 503 });
      await acknowledgeProvisioned(store, provisioningClient(baseUrl), result.change);
    }
  } catch {
    return new Response("provisioning unavailable", { status: 503 });
  }
  return new Response("", { status: 200 });
}

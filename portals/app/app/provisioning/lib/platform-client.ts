/**
 * Calls the platform with the product's provisioning read and workspace ACK tickets.
 * @package @vxtpl/app
 * @layer Application
 * @category Provisioning
 * @author AI-Generated
 * @date 2026-11-26
 */

import { BRAND } from "@vxtpl/shared/brand";
import { assertInternalTarget } from "../../lib/internal-target";
import { mintProvisioningRead, mintS2S, PLATFORM_AUDIENCE } from "../../lib/s2s-token";
import type { ProvisioningChange } from "./store";

const product = BRAND.productCode;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const isWorkspaceUuid = (value: unknown): value is string => typeof value === "string" && uuid.test(value);

export function provisioningClient(baseUrl: string) {
  async function request(path: string, token: string, init: RequestInit = {}): Promise<unknown> {
    const url = assertInternalTarget(baseUrl.replace(/\/$/, "") + path);
    const headers = new Headers(init.headers);
    headers.set("authorization", "Bearer " + token);
    headers.set("accept", "application/json");
    const response = await fetch(url, {
      ...init, headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Provisioning platform returned HTTP " + response.status);
    return response.json();
  }

  return {
    async list(cursor: string | null) {
      const { claims, token } = await mintProvisioningRead();
      if (claims.aud !== PLATFORM_AUDIENCE || claims.act?.sub !== product || claims.mode !== "service" ||
          claims.scope !== "provisioning:read" || claims.sub || claims.workspace_id || claims.org_id || claims.tenant_id) {
        throw new Error("Invalid provisioning read ticket scope");
      }
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("cursor", cursor);
      const body = await request("/platform/provisioning?" + params, token) as { items?: unknown; nextCursor?: unknown } | null;
      if (!body || !Array.isArray(body.items) || body.items.length > 100 ||
          !(body.nextCursor === null || (typeof body.nextCursor === "string" && body.nextCursor.length > 0))) {
        throw new Error("Invalid provisioning page");
      }
      return { items: body.items.map(parseItem), nextCursor: body.nextCursor };
    },
    async acknowledge(change: ProvisioningChange) {
      const { claims, token } = await mintS2S(PLATFORM_AUDIENCE, { workspaceId: change.workspaceId });
      if (claims.aud !== PLATFORM_AUDIENCE || claims.act?.sub !== product || change.product !== product ||
          claims.mode !== "service" || claims.scope !== "tool:vxture" || claims.workspace_id !== change.workspaceId || claims.sub) {
        throw new Error("Invalid provisioning acknowledgement ticket scope");
      }
      const body = await request("/provisioning/ack", token, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace_id: change.workspaceId, product, status: "ready", delivery_id: change.deliveryId,
          detail: { seq: change.seq },
        }),
      }) as { workspace_id?: unknown; product?: unknown; acked_at?: unknown; replayed?: unknown } | null;
      if (!body || body.workspace_id !== change.workspaceId || body.product !== product ||
          typeof body.acked_at !== "string" || Number.isNaN(Date.parse(body.acked_at)) || typeof body.replayed !== "boolean") {
        throw new Error("Invalid provisioning acknowledgement receipt");
      }
    },
  };
}

function parseItem(value: unknown): ProvisioningChange | null {
  if (!value || typeof value !== "object") throw new Error("Invalid provisioning item");
  const row = value as Record<string, unknown>;
  const { workspace_id, state, seq } = row;
  if (!isWorkspaceUuid(workspace_id) || typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0) {
    throw new Error("Invalid provisioning item scope or sequence");
  }
  if (state === "pending") return null;
  if (state !== "provisioned" && state !== "deprovisioned") throw new Error("Invalid provisioning state");
  return { workspaceId: workspace_id, seq, status: state, product, type: "tenant." + state };
}

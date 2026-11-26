/**
 * Shares short-lived C2 snapshots across product instances.
 * @package @vxtpl/app
 * @layer Application
 * @category Entitlement
 * @author AI-Generated
 * @date 2026-11-26
 */

import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { BRAND } from "@vxtpl/shared/brand";
import { rpRedis } from "../auth/lib/session-store";
import { deployStage } from "../lib/deploy-stage";
import type { Entitlement } from "./types";

// ============================================================================
// Redis snapshot
// ============================================================================

export const ENTITLEMENT_CACHE_TTL_MS = 45_000;

const READ_OR_MARK = `
  local value = redis.call('GET', KEYS[1])
  if value then return value end
  redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
  return ARGV[1]
`;

// Keeping the original TTL bounds the lifetime from before the platform read.
// A deleted or expired marker rejects any response still in flight.
const WRITE_IF_CURRENT = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
  return 1
`;

function cacheKey(workspaceId: string): string {
  const clientId = process.env.OIDC_CLIENT_ID ?? BRAND.productCode;
  return `vx:entitlement:v1:${deployStage()}:${clientId}:${BRAND.productCode}:${workspaceId}`;
}

/**
 * Gets a workspace snapshot after the caller has established its OBO scope.
 * @param workspaceId - Verified active workspace.
 * @param load - Live C2 request under the caller's verified ticket.
 * @param redis - Shared Redis connection, or null for direct reads.
 * @returns The current workspace entitlement.
 * @throws When a live read fails or invalidation repeatedly races the read.
 */
export async function readCachedEntitlement(
  workspaceId: string,
  load: () => Promise<Entitlement>,
  redis: Pick<Redis, "eval"> | null = process.env.REDIS_URL ? rpRedis() : null,
): Promise<Entitlement> {
  if (!redis) return load();
  const key = cacheKey(workspaceId);
  for (let attempt = 0; attempt < 2; attempt++) {
    const marker = "!" + randomUUID();
    const entry = await redis.eval(READ_OR_MARK, 1, key, marker, ENTITLEMENT_CACHE_TTL_MS)
      .catch(() => null);
    if (typeof entry !== "string") return load();
    if (!entry.startsWith("!")) {
      try {
        const cached = JSON.parse(entry) as Entitlement;
        if (cached.workspace_id === workspaceId && cached.product === BRAND.productCode) return cached;
      } catch {
        // A corrupt cache entry is never used for a decision.
      }
      return load();
    }

    const value = await load();
    const written = await redis.eval(WRITE_IF_CURRENT, 1, key, entry, JSON.stringify(value))
      .catch(() => null);
    if (written === 1) return value;
    if (written === null) return load();
  }
  throw new Error("Entitlement changed while it was being resolved");
}

/**
 * Evicts the snapshot and fences older in-flight reads across all instances.
 * @param workspaceId - Workspace changed by C3.
 * @param redis - Shared Redis connection, or null when caching is disabled.
 * @returns When eviction has completed.
 * @throws When Redis cannot confirm the eviction.
 */
export async function invalidateWorkspaceEntitlement(
  workspaceId: string,
  redis: Pick<Redis, "del"> | null = process.env.REDIS_URL ? rpRedis() : null,
): Promise<void> {
  await redis?.del(cacheKey(workspaceId));
}

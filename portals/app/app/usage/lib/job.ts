/**
 * Schedules product counter usage delivery in the Node runtime.
 * @package @vxtpl/app
 * @layer Application
 * @category Usage
 * @author AI-Generated
 * @date 2026-11-26
 */

import { randomUUID } from "node:crypto";
import { BRAND } from "@vxtpl/shared/brand";
import { acquireRefresh, releaseRefresh } from "../../auth/lib/session-store";
import { isDeployedStage } from "../../lib/deploy-stage";
import { prismaEnabled } from "../../lib/db";
import { flushUsage, type FlushSummary } from "./flush";
import type { UsageScope } from "./store";

const INTERVAL_MS = 5 * 60_000;
// A full batch may spend 10 seconds each on ticket exchange and delivery per row.
const LEASE_MS = 20 * 60_000;
const LOCK = "usage-flush";
const UUID_PATTERN = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
const WORKSPACE_ID = new RegExp(`^${UUID_PATTERN}$`, "i");
const ACCOUNT_SUBJECT = new RegExp(`^usr_${UUID_PATTERN}$`, "i");
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,128}$/;

type UsageJobConfig = { mode: "manual" | "on" } | { mode: "demo"; scope: UsageScope };

/**
 * Resolves deployment configuration for the automatic and manual job entry points.
 * @param env - Server runtime settings.
 * @returns The reporting mode and, for acceptance, the only eligible row.
 * @throws {Error} When a configured mode or acceptance scope is invalid.
 */
export function usageJobConfig(env: NodeJS.ProcessEnv = process.env): UsageJobConfig {
  const mode = env.USAGE_FLUSH_MODE;
  if (!mode) return { mode: "manual" };
  if (mode === "on") return { mode };
  if (mode !== "demo") throw new Error("Invalid USAGE_FLUSH_MODE");

  const { PLATFORM_DEMO_WORKSPACE_ID: workspaceId, PLATFORM_DEMO_SUBJECT: endUserId,
    USAGE_FLUSH_DEMO_KEY: idempotencyKey } = env;
  if (!workspaceId || !WORKSPACE_ID.test(workspaceId) || !endUserId || !ACCOUNT_SUBJECT.test(endUserId) ||
      !idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw new Error("Usage flush demo requires a valid workspace, account subject and original usage key");
  }
  return { mode, scope: { workspaceId, endUserId, idempotencyKey } };
}

/**
 * Runs one batch under a shared lease in a deployed stack.
 * @param config - Validated reporting configuration.
 * @returns The batch counts, or null when another process owns the lease.
 * @throws {Error} If a deployed stack cannot coordinate or access its buffer.
 */
export async function runUsageJob(config = usageJobConfig()): Promise<FlushSummary | null> {
  const options = config.mode === "demo" ? { scope: config.scope } : {};
  if (isDeployedStage()) {
    if (!process.env.REDIS_URL || !process.env.PLATFORM_API_URL || !prismaEnabled()) {
      throw new Error("Usage flush requires Redis, PostgreSQL and the platform API");
    }
    const clientId = process.env.OIDC_CLIENT_ID ?? BRAND.productCode;
    const owner = randomUUID();
    if (!await acquireRefresh(clientId, LOCK, owner, LEASE_MS)) return null;
    try {
      return await flushUsage(options);
    } finally {
      await releaseRefresh(clientId, LOCK, owner).catch(() => undefined);
    }
  }
  return flushUsage(options);
}

// ============================================================================
// Scheduler
// ============================================================================

let started = false;

/**
 * Starts the opted-in worker after Next.js enters its Node runtime.
 * @returns Nothing. Each completed pass schedules the next.
 */
export function startUsageJob(): void {
  if (started || !isDeployedStage() || !process.env.USAGE_FLUSH_MODE) return;
  let config: UsageJobConfig;
  try {
    config = usageJobConfig();
  } catch {
    console.error("[usage] Invalid flush configuration");
    return;
  }

  started = true;
  async function tick() {
    try {
      const result = await runUsageJob(config);
      if (result?.scanned) {
        const log = result.retried ? console.warn : console.info;
        log("[usage] Flush completed", result);
      }
    } catch {
      console.warn("[usage] Flush deferred until the next pass");
    } finally {
      setTimeout(tick, INTERVAL_MS).unref();
    }
  }
  setTimeout(tick, 0).unref();
}

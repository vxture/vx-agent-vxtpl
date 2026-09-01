import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getEntitlementResolver } from "../../../entitlement/resolver";
import { canUseFeature, minTierFor } from "../../../entitlement/capability";
import { isCallerError, resolveGameCaller } from "../../../game/api-caller";
import { getGameStore } from "../../../game/store";
import {
  RUNS_METRIC,
  dailyRunCap,
  nextUtcMidnight,
  remainingRuns,
  utcDayStart,
} from "../../../game/rules";
import { recordUsage } from "../../../usage/lib/buffer";

// POST /api/game/run - start a challenge run. THIS is where the daily quota is
// spent: the row is inserted before the first bullet flies, so closing the tab
// mid-run cannot refund the attempt (the quota counts challenges, not
// finishes). Fail-closed: no entitled tier, no run.
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const caller = await resolveGameCaller();
  if (isCallerError(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const entitlement = await getEntitlementResolver().resolve(caller.workspaceId);
  if (!canUseFeature(entitlement, "game:play")) {
    return NextResponse.json(
      { error: "no active subscription covers the challenge", cta: true },
      { status: 403 },
    );
  }

  const store = getGameStore();
  const now = new Date();
  const cap = dailyRunCap(entitlement);
  const usedToday = await store.countStartedSince(caller.workspaceId, caller.sub, utcDayStart(now));
  const remaining = remainingRuns(cap, usedToday);
  if (remaining === 0) {
    return NextResponse.json(
      {
        error: "daily challenge quota exhausted",
        quota: { cap, usedToday, remaining, resetsAt: nextUtcMidnight(now).toISOString() },
        requiredTier: minTierFor("game:unlimited-runs"),
      },
      { status: 429 },
    );
  }

  const run = await store.createRun({
    workspaceId: caller.workspaceId,
    sub: caller.sub,
    seed: randomBytes(8).toString("hex"),
  });

  // Meter the product's unit of work - a challenge run - the same way chat
  // meters a message: buffered locally, flushed asynchronously, and never
  // allowed to fail the run the player is already counting down into.
  try {
    await recordUsage({
      workspaceId: caller.workspaceId,
      metric: RUNS_METRIC,
      amount: 1,
      idempotencyKey: randomUUID(),
      endUserId: caller.sub, // runs are personal; the platform can attribute them
    });
  } catch (err) {
    console.error(`[game] usage record failed for workspace ${caller.workspaceId}:`, err);
  }

  return NextResponse.json({
    runId: run.id,
    seed: run.seed,
    quota: {
      cap,
      usedToday: usedToday + 1,
      remaining: remainingRuns(cap, usedToday + 1),
      resetsAt: nextUtcMidnight(now).toISOString(),
    },
  });
}

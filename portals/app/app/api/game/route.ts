import { NextResponse } from "next/server";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { canUseFeature, minTierFor } from "../../entitlement/capability";
import { ctaFor } from "../../entitlement/types";
import { isCallerError, resolveGameCaller } from "../../game/api-caller";
import { getGameStore } from "../../game/store";
import {
  RUN_DURATION_MS,
  dailyRunCap,
  nextUtcMidnight,
  remainingRuns,
  utcDayStart,
} from "../../game/rules";

// GET /api/game - the challenge context: what this player may do, how much
// quota is left today, and their personal best. One call renders the whole
// /challenge surface; the write paths are /api/game/run and /run/finish.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const caller = await resolveGameCaller();
  if (isCallerError(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const entitlement = await getEntitlementResolver().resolve(caller.workspaceId);
  const store = getGameStore();
  const now = new Date();

  const cap = dailyRunCap(entitlement);
  const usedToday = await store.countStartedSince(caller.workspaceId, caller.sub, utcDayStart(now));
  const [best] = await store.bestFinished(caller.workspaceId, caller.sub, 1);

  return NextResponse.json({
    tier: entitlement.tier,
    cta: ctaFor(entitlement),
    runDurationMs: RUN_DURATION_MS,
    gates: {
      play: canUseFeature(entitlement, "game:play"),
      history: canUseFeature(entitlement, "game:history"),
      leaderboard: canUseFeature(entitlement, "game:leaderboard"),
      trend: canUseFeature(entitlement, "game:trend"),
    },
    requiredTiers: {
      unlimitedRuns: minTierFor("game:unlimited-runs"),
      history: minTierFor("game:history"),
      leaderboard: minTierFor("game:leaderboard"),
      trend: minTierFor("game:trend"),
    },
    quota: {
      cap, // -1 = unlimited
      usedToday,
      remaining: remainingRuns(cap, usedToday),
      resetsAt: nextUtcMidnight(now).toISOString(),
    },
    best: best?.scoreMs != null ? { scoreMs: best.scoreMs, achievedAt: best.finishedAt } : null,
  });
}

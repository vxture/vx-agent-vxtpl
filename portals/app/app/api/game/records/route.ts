import { NextResponse } from "next/server";
import { getEntitlementResolver } from "../../../entitlement/resolver";
import { canUseFeature, minTierFor } from "../../../entitlement/capability";
import { isCallerError, resolveGameCaller } from "../../../game/api-caller";
import { getGameStore, type GameRunRow } from "../../../game/store";
import { TOP_PIN_COUNT, TREND_DAYS, dailyTrend, historyWindowFor } from "../../../game/rules";

// GET /api/game/records - the player's own record, sliced by tier:
// starter sees their last 10 finished runs, pro sees the last 30 days plus the
// daily trend. The best-3 pins are ALL-TIME on both tiers - the window widens
// with the ladder, the podium never forgets. Free gets the locked shape with
// the tier that would open it, not an error: the surface renders the offer.
export const dynamic = "force-dynamic";

// Pro's raw-list cap. The window is 30 days; an unbounded player could hold
// thousands of rows and the LIST is for reading, the trend for the shape.
const RECENT_MAX = 100;

function runJson(r: GameRunRow) {
  return {
    scoreMs: r.scoreMs,
    outcome: r.outcome,
    playedAt: r.startedAt.toISOString(),
  };
}

export async function GET(): Promise<Response> {
  const caller = await resolveGameCaller();
  if (isCallerError(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const entitlement = await getEntitlementResolver().resolve(caller.workspaceId);
  const window = historyWindowFor(entitlement);

  if (window.kind === "none") {
    return NextResponse.json({
      allowed: false,
      requiredTier: minTierFor("game:history"),
      requiredTierForTrend: minTierFor("game:trend"),
    });
  }

  const store = getGameStore();
  const top = await store.bestFinished(caller.workspaceId, caller.sub, TOP_PIN_COUNT);

  let recent: GameRunRow[];
  if (window.kind === "last10") {
    recent = await store.recentFinished(caller.workspaceId, caller.sub, { limit: window.limit });
  } else {
    const since = new Date(Date.now() - window.days * 24 * 60 * 60 * 1000);
    recent = await store.recentFinished(caller.workspaceId, caller.sub, { since, limit: RECENT_MAX });
  }

  const trendAllowed = canUseFeature(entitlement, "game:trend");
  let trend = null;
  if (trendAllowed) {
    const since = new Date(Date.now() - TREND_DAYS * 24 * 60 * 60 * 1000);
    // Unbounded on purpose: the trend aggregates EVERY run in the window, not
    // just the RECENT_MAX the list shows.
    const all = await store.recentFinished(caller.workspaceId, caller.sub, { since });
    trend = dailyTrend(
      all.filter((r) => r.scoreMs != null).map((r) => ({ scoreMs: r.scoreMs!, startedAt: r.startedAt })),
    );
  }

  return NextResponse.json({
    allowed: true,
    window,
    top: top.map(runJson),
    recent: recent.map(runJson),
    trend,
    trendAllowed,
    requiredTierForTrend: minTierFor("game:trend"),
  });
}

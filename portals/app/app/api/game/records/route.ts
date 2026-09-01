import { NextResponse } from "next/server";
import { getEntitlementResolver } from "../../../entitlement/resolver";
import { canUseFeature, minTierFor } from "../../../entitlement/capability";
import { isCallerError, resolveGameCaller } from "../../../game/api-caller";
import { getGameStore, type GameRunRow } from "../../../game/store";
import { TOP_PIN_COUNT, dailyTrend, historyWindowFor, seasonOf } from "../../../game/rules";

// GET /api/game/records - the player's own record, sliced by tier and scoped
// to the CURRENT SEASON (owner decision 2026-09-01): starter sees their last
// 10 finished runs this season, pro the WHOLE season plus the daily trend -
// no hardcoded day count anywhere, the window is the season period from
// seasonOf. The best-3 podium is the season's. The only all-time numbers
// anywhere are the topbar's all-time best and the all-time board. Free gets
// the locked shape with the tier that would open it, not an error: the
// surface renders the offer.
export const dynamic = "force-dynamic";

// Pro's raw-list cap. The window is the season; an unbounded player could hold
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

  // EVERYTHING below the topbar is CURRENT-SEASON only (owner decision
  // 2026-09-01): podium, recent list and trend all start at the quarter
  // boundary. The only all-time numbers left anywhere are the topbar's
  // all-time best and the all-time board.
  const store = getGameStore();
  const season = seasonOf(new Date());
  const top = await store.bestFinished(caller.workspaceId, caller.sub, TOP_PIN_COUNT, season.start);

  let recent: GameRunRow[];
  if (window.kind === "last10") {
    recent = await store.recentFinished(caller.workspaceId, caller.sub, {
      since: season.start,
      limit: window.limit,
    });
  } else {
    // Pro's window IS the season - no hardcoded day count (owner decision
    // 2026-09-01); every stat adapts to the season period from seasonOf.
    recent = await store.recentFinished(caller.workspaceId, caller.sub, {
      since: season.start,
      limit: RECENT_MAX,
    });
  }

  const trendAllowed = canUseFeature(entitlement, "game:trend");
  let trend = null;
  if (trendAllowed) {
    // Unbounded on purpose: the trend aggregates EVERY run in the season,
    // not just the RECENT_MAX the list shows.
    const all = await store.recentFinished(caller.workspaceId, caller.sub, { since: season.start });
    trend = dailyTrend(
      all.filter((r) => r.scoreMs != null).map((r) => ({ scoreMs: r.scoreMs!, startedAt: r.startedAt })),
    );
  }

  return NextResponse.json({
    allowed: true,
    window,
    season: {
      key: season.key,
      label: season.label,
      startsAt: season.start.toISOString(),
      endsAt: season.end.toISOString(),
    },
    top: top.map(runJson),
    recent: recent.map(runJson),
    trend,
    trendAllowed,
    requiredTierForTrend: minTierFor("game:trend"),
  });
}

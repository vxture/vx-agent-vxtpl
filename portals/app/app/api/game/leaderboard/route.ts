import { NextResponse } from "next/server";
import { getEntitlementResolver } from "../../../entitlement/resolver";
import { canUseFeature, minTierFor } from "../../../entitlement/capability";
import { isCallerError, resolveGameCaller } from "../../../game/api-caller";
import { getGameStore, type LeaderboardRow } from "../../../game/store";
import { LEADERBOARD_SIZE, QUALIFY_MS, callSign, seasonOf } from "../../../game/rules";

// GET /api/game/leaderboard - the global boards (pro). Two, and only two
// (owner decision 2026-09-01): the CURRENT season (natural quarter, UTC) and
// the all-time board, each capped at the top 100. Expired seasons are not
// archived - the season board is the all-time query windowed to this
// quarter, so an old season ages out by falling outside the window, not by a
// job that could fail.
//
// The one surface that deliberately crosses workspaces, so it is stripped to
// what a board needs: call sign, score, when. Subs and workspaces stay
// server-side; `you` is computed here, not by the client comparing
// identifiers it should not have.
export const dynamic = "force-dynamic";

function entries(rows: LeaderboardRow[], callerSub: string) {
  return rows.map((r, i) => ({
    rank: i + 1,
    callSign: callSign(r.sub),
    scoreMs: r.scoreMs,
    qualified: r.scoreMs >= QUALIFY_MS,
    achievedAt: r.achievedAt.toISOString(),
    you: r.sub === callerSub,
  }));
}

export async function GET(): Promise<Response> {
  const caller = await resolveGameCaller();
  if (isCallerError(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const entitlement = await getEntitlementResolver().resolve(caller.workspaceId);
  if (!canUseFeature(entitlement, "game:leaderboard")) {
    return NextResponse.json({
      allowed: false,
      requiredTier: minTierFor("game:leaderboard"),
    });
  }

  const store = getGameStore();
  const season = seasonOf(new Date());
  const [seasonRows, allTimeRows, [me]] = await Promise.all([
    store.leaderboard(LEADERBOARD_SIZE, season.start),
    store.leaderboard(LEADERBOARD_SIZE),
    store.bestFinished(caller.workspaceId, caller.sub, 1),
  ]);

  return NextResponse.json({
    allowed: true,
    season: { key: season.key, label: season.label, endsAt: season.end.toISOString() },
    seasonEntries: entries(seasonRows, caller.sub),
    allTimeEntries: entries(allTimeRows, caller.sub),
    me: {
      callSign: callSign(caller.sub),
      bestMs: me?.scoreMs ?? null,
    },
  });
}

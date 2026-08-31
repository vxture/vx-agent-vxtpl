import { NextResponse } from "next/server";
import { getEntitlementResolver } from "../../../entitlement/resolver";
import { canUseFeature, minTierFor } from "../../../entitlement/capability";
import { isCallerError, resolveGameCaller } from "../../../game/api-caller";
import { getGameStore } from "../../../game/store";
import { LEADERBOARD_SIZE, RUN_DURATION_MS, callSign } from "../../../game/rules";

// GET /api/game/leaderboard - the global board (pro). The one surface that
// deliberately crosses workspaces, so it is stripped to what a board needs:
// call sign, score, when. Subs and workspaces stay server-side; `you` is
// computed here, not by the client comparing identifiers it should not have.
export const dynamic = "force-dynamic";

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
  const rows = await store.leaderboard(LEADERBOARD_SIZE);
  const [me] = await store.bestFinished(caller.workspaceId, caller.sub, 1);

  return NextResponse.json({
    allowed: true,
    entries: rows.map((r, i) => ({
      rank: i + 1,
      callSign: callSign(r.sub),
      scoreMs: r.scoreMs,
      survived: r.scoreMs >= RUN_DURATION_MS,
      achievedAt: r.achievedAt.toISOString(),
      you: r.sub === caller.sub,
    })),
    me: {
      callSign: callSign(caller.sub),
      bestMs: me?.scoreMs ?? null,
    },
  });
}

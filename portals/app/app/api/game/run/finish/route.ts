import { NextResponse } from "next/server";
import { isCallerError, resolveGameCaller } from "../../../../game/api-caller";
import { getGameStore } from "../../../../game/store";
import { isValidScoreMs, outcomeForScore, scoreFitsWallClock } from "../../../../game/rules";

// POST /api/game/run/finish - close a run with its score. The client is the
// only witness to the bullets, so the score is client-reported - but it is
// bounded three ways before a row records it: the run must be this caller's
// own started run, the score must fit the run's fixed duration, and it must
// fit the wall clock the server observed. That is proportionate for an arcade
// board; it keeps the trivial forgeries (someone else's run, replayed finish,
// 20s reported after 3s of play) out of the leaderboard.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const caller = await resolveGameCaller();
  if (isCallerError(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }
  const raw = body as Record<string, unknown> | null;
  const runId = typeof raw?.runId === "string" ? raw.runId : null;
  const scoreMs = raw?.scoreMs;
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });
  if (!isValidScoreMs(scoreMs)) {
    return NextResponse.json({ error: "scoreMs must be an integer within the score ceiling" }, { status: 400 });
  }

  const store = getGameStore();
  const run = await store.getRun(runId);
  // A missing run and someone else's run answer identically: nothing to leak.
  if (!run || run.workspaceId !== caller.workspaceId || run.sub !== caller.sub) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  if (run.status === "finished") {
    return NextResponse.json({ error: "run already finished" }, { status: 409 });
  }

  const finishedAt = new Date();
  if (!scoreFitsWallClock(scoreMs, run.startedAt, finishedAt)) {
    return NextResponse.json({ error: "score exceeds the observed run time" }, { status: 422 });
  }

  const outcome = outcomeForScore(scoreMs);
  await store.finishRun(run.id, { outcome, scoreMs, finishedAt });

  const [best] = await store.bestFinished(caller.workspaceId, caller.sub, 1);
  return NextResponse.json({
    outcome,
    scoreMs,
    best: best?.scoreMs != null ? { scoreMs: best.scoreMs, achievedAt: best.finishedAt } : null,
    isPersonalBest: best?.id === run.id,
  });
}

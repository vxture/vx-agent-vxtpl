import { NextResponse } from "next/server";
import { getGameStore } from "../../../game/store";
import { MAX_SCORE_MS, QUALIFY_MS, seasonOf } from "../../../game/rules";
import { isDeployedStage } from "../../../lib/deploy-stage";

// POST /api/game/dev-seed - LOCAL-DEV sample data: a field of synthetic
// players so the boards, podium and trend render with something to say.
//
// Guarded the same way the mock resolvers are: on a deployed stage this
// route refuses outright. It exists because the in-memory store lives inside
// the dev server process - no external script can reach it - and an empty
// leaderboard is unreviewable. Seeding is additive (run it again for a
// bigger field); restart the dev server to reset.
export const dynamic = "force-dynamic";

const DEV_WORKSPACE_ID = "ws_local_dev";
const DEV_SUB = "usr_local_dev";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Deterministic-enough PRNG so repeated seeds differ but stay plausible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Skewed score: most runs die well under the bar, ~18% qualify, rare epics. */
function sampleScore(rand: () => number): number {
  const roll = rand();
  if (roll < 0.82) return Math.round(800 + rand() * rand() * 18000); // under the bar
  if (roll < 0.97) return Math.round(QUALIFY_MS + rand() * 25000); // qualified
  return Math.min(MAX_SCORE_MS, Math.round(QUALIFY_MS + 25000 + rand() * 40000)); // epic
}

export async function POST(req: Request): Promise<Response> {
  if (isDeployedStage()) {
    return NextResponse.json({ error: "dev-seed is local-dev only" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { players?: number };
  const players = Math.min(Math.max(body.players ?? 24, 1), 200);

  const store = getGameStore();
  const rand = rng(Date.now());
  const now = Date.now();
  const season = seasonOf(new Date());
  let runs = 0;

  async function finishedRun(workspaceId: string, sub: string, startedAt: Date, scoreMs: number) {
    const run = await store.createRun({ workspaceId, sub, seed: "5eed" + Math.floor(rand() * 1e8).toString(16), startedAt });
    await store.finishRun(run.id, {
      outcome: scoreMs >= QUALIFY_MS ? "survived" : "hit",
      scoreMs,
      finishedAt: new Date(startedAt.getTime() + scoreMs + 1000),
    });
    runs++;
  }

  // The field: synthetic pilots, each in their own workspace. Roughly one in
  // five played only LAST season - they hold the all-time board apart from
  // the season board.
  for (let p = 0; p < players; p++) {
    const sub = `usr_seed_${String(p + 1).padStart(3, "0")}`;
    const ws = `ws_seed_${String(p + 1).padStart(3, "0")}`;
    const lastSeasonOnly = rand() < 0.2;
    const runCount = 1 + Math.floor(rand() * 5);
    for (let i = 0; i < runCount; i++) {
      const startedAt = lastSeasonOnly
        ? new Date(season.start.getTime() - (1 + rand() * 60) * DAY_MS) // before this quarter
        : new Date(now - rand() * Math.min(now - season.start.getTime(), 30 * DAY_MS));
      await finishedRun(ws, sub, startedAt, sampleScore(rand));
    }
  }

  // The dev caller's own arc: a 30-day practice curve that actually improves,
  // so YOUR RECORD, the podium and the trend all have a story to show.
  for (let d = 29; d >= 0; d--) {
    if (rand() < 0.35) continue; // rest days stay gaps in the trend
    const perDay = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < perDay; i++) {
      const progress = (30 - d) / 30; // later days run longer
      const base = 2000 + progress * 16000;
      const score = Math.round(base + (rand() - 0.35) * 8000);
      const startedAt = new Date(now - d * DAY_MS - rand() * 0.5 * DAY_MS);
      await finishedRun(DEV_WORKSPACE_ID, DEV_SUB, startedAt, Math.max(600, Math.min(score, 34000)));
    }
  }

  return NextResponse.json({ ok: true, players, runs });
}

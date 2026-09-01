import type { GameStore, GameRunRow, LeaderboardRow, RunOutcome, RunStatus } from "./store";
import { getPrismaClient } from "../lib/db";

// Prisma-backed GameStore over vxtpl_game.run. Used when DATABASE_URL is set.

interface DbRun {
  id: string;
  workspaceId: string;
  sub: string;
  status: string;
  outcome: string | null;
  scoreMs: number | null;
  seed: string;
  startedAt: Date;
  finishedAt: Date | null;
}

function toRow(r: DbRun): GameRunRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    sub: r.sub,
    status: r.status as RunStatus,
    outcome: (r.outcome as RunOutcome | null) ?? null,
    scoreMs: r.scoreMs,
    seed: r.seed,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  };
}

export class PrismaGameStore implements GameStore {
  async createRun(input: { workspaceId: string; sub: string; seed: string; startedAt?: Date }): Promise<GameRunRow> {
    const p = await getPrismaClient();
    const row = await p.gameRun.create({
      data: {
        workspaceId: input.workspaceId,
        sub: input.sub,
        seed: input.seed,
        ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      },
    });
    return toRow(row);
  }

  async getRun(id: string): Promise<GameRunRow | null> {
    const p = await getPrismaClient();
    const row = await p.gameRun.findUnique({ where: { id } });
    return row ? toRow(row) : null;
  }

  async finishRun(id: string, patch: { outcome: RunOutcome; scoreMs: number; finishedAt: Date }): Promise<void> {
    const p = await getPrismaClient();
    await p.gameRun.update({
      where: { id },
      data: {
        status: "finished",
        outcome: patch.outcome,
        scoreMs: patch.scoreMs,
        finishedAt: patch.finishedAt,
      },
    });
  }

  async countStartedSince(workspaceId: string, sub: string, since: Date): Promise<number> {
    const p = await getPrismaClient();
    return p.gameRun.count({ where: { workspaceId, sub, startedAt: { gte: since } } });
  }

  async recentFinished(
    workspaceId: string,
    sub: string,
    opts: { limit?: number; since?: Date },
  ): Promise<GameRunRow[]> {
    const p = await getPrismaClient();
    const rows = await p.gameRun.findMany({
      where: {
        workspaceId,
        sub,
        status: "finished",
        ...(opts.since ? { startedAt: { gte: opts.since } } : {}),
      },
      orderBy: { startedAt: "desc" },
      ...(opts.limit !== undefined ? { take: opts.limit } : {}),
    });
    return rows.map(toRow);
  }

  async bestFinished(workspaceId: string, sub: string, n: number): Promise<GameRunRow[]> {
    const p = await getPrismaClient();
    const rows = await p.gameRun.findMany({
      where: { workspaceId, sub, status: "finished", scoreMs: { not: null } },
      orderBy: [{ scoreMs: "desc" }, { finishedAt: "asc" }],
      take: n,
    });
    return rows.map(toRow);
  }

  async leaderboard(n: number, since?: Date): Promise<LeaderboardRow[]> {
    const p = await getPrismaClient();
    // One row per (workspace, sub): their best finished run, earliest finish
    // winning a tie. DISTINCT ON is the idiomatic Postgres shape for this and
    // has no Prisma-query equivalent that keeps the tie-break. The season
    // board is the SAME query windowed by finished_at (epoch floor when
    // absent, so the SQL shape stays one statement).
    const floor = since ?? new Date(0);
    const rows = await p.$queryRaw<{ sub: string; score_ms: number; finished_at: Date }[]>`
      SELECT sub, score_ms, finished_at FROM (
        SELECT DISTINCT ON (workspace_id, sub) sub, score_ms, finished_at
        FROM vxtpl_game.run
        WHERE status = 'finished' AND score_ms IS NOT NULL AND finished_at IS NOT NULL
          AND finished_at >= ${floor}
        ORDER BY workspace_id, sub, score_ms DESC, finished_at ASC
      ) best
      ORDER BY score_ms DESC, finished_at ASC
      LIMIT ${n}
    `;
    return rows.map((r) => ({ sub: r.sub, scoreMs: r.score_ms, achievedAt: r.finished_at }));
  }
}

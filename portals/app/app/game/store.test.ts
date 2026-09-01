import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryGameStore } from "./store";

const WS = "11111111-1111-1111-1111-111111111111";
const SUB = "usr_aaaa";

async function seedRun(
  store: InMemoryGameStore,
  opts: { ws?: string; sub?: string; startedAt: string; scoreMs?: number; finishedAt?: string },
) {
  const run = await store.createRun({
    workspaceId: opts.ws ?? WS,
    sub: opts.sub ?? SUB,
    seed: "cafe",
    startedAt: new Date(opts.startedAt),
  });
  if (opts.scoreMs !== undefined) {
    await store.finishRun(run.id, {
      outcome: opts.scoreMs >= 20000 ? "survived" : "hit",
      scoreMs: opts.scoreMs,
      finishedAt: new Date(opts.finishedAt ?? opts.startedAt),
    });
  }
  return run;
}

test("countStartedSince counts started AND finished runs from the boundary", async () => {
  const store = new InMemoryGameStore();
  await seedRun(store, { startedAt: "2026-08-30T23:59:00Z", scoreMs: 5000 }); // yesterday
  await seedRun(store, { startedAt: "2026-08-31T00:01:00Z" }); // abandoned, still counts
  await seedRun(store, { startedAt: "2026-08-31T10:00:00Z", scoreMs: 9000 });
  await seedRun(store, { startedAt: "2026-08-31T11:00:00Z", sub: "usr_other", scoreMs: 9000 });
  const n = await store.countStartedSince(WS, SUB, new Date("2026-08-31T00:00:00Z"));
  assert.equal(n, 2);
});

test("recentFinished is newest-first, windowed, and excludes unfinished runs", async () => {
  const store = new InMemoryGameStore();
  await seedRun(store, { startedAt: "2026-08-01T10:00:00Z", scoreMs: 1000 });
  await seedRun(store, { startedAt: "2026-08-20T10:00:00Z", scoreMs: 2000 });
  await seedRun(store, { startedAt: "2026-08-30T10:00:00Z", scoreMs: 3000 });
  await seedRun(store, { startedAt: "2026-08-31T10:00:00Z" }); // unfinished
  const all = await store.recentFinished(WS, SUB, {});
  assert.deepEqual(all.map((r) => r.scoreMs), [3000, 2000, 1000]);
  const windowed = await store.recentFinished(WS, SUB, { since: new Date("2026-08-15T00:00:00Z"), limit: 1 });
  assert.deepEqual(windowed.map((r) => r.scoreMs), [3000]);
});

test("bestFinished ranks by score, earlier finish winning ties", async () => {
  const store = new InMemoryGameStore();
  await seedRun(store, { startedAt: "2026-08-01T10:00:00Z", scoreMs: 9000, finishedAt: "2026-08-01T10:00:09Z" });
  await seedRun(store, { startedAt: "2026-08-02T10:00:00Z", scoreMs: 20000, finishedAt: "2026-08-02T10:00:20Z" });
  await seedRun(store, { startedAt: "2026-08-03T10:00:00Z", scoreMs: 20000, finishedAt: "2026-08-03T10:00:20Z" });
  await seedRun(store, { startedAt: "2026-08-04T10:00:00Z", scoreMs: 4000 });
  const best = await store.bestFinished(WS, SUB, 3);
  assert.deepEqual(best.map((r) => r.scoreMs), [20000, 20000, 9000]);
  assert.equal(best[0].finishedAt?.toISOString(), "2026-08-02T10:00:20.000Z");
});

test("leaderboard keeps one row per player: their best, best first", async () => {
  const store = new InMemoryGameStore();
  await seedRun(store, { startedAt: "2026-08-01T10:00:00Z", scoreMs: 9000 });
  await seedRun(store, { startedAt: "2026-08-02T10:00:00Z", scoreMs: 15000 });
  await seedRun(store, { sub: "usr_bbbb", startedAt: "2026-08-03T10:00:00Z", scoreMs: 20000 });
  await seedRun(store, { ws: "22222222-2222-2222-2222-222222222222", sub: "usr_cccc", startedAt: "2026-08-04T10:00:00Z", scoreMs: 12000 });
  const board = await store.leaderboard(10);
  assert.deepEqual(
    board.map((r) => [r.sub, r.scoreMs]),
    [
      ["usr_bbbb", 20000],
      ["usr_aaaa", 15000],
      ["usr_cccc", 12000],
    ],
  );
});

test("bestFinished windowed by `since` is the season best", async () => {
  const store = new InMemoryGameStore();
  await seedRun(store, { startedAt: "2026-06-10T10:00:00Z", scoreMs: 28000, finishedAt: "2026-06-10T10:00:28Z" }); // last season trophy
  await seedRun(store, { startedAt: "2026-08-10T10:00:00Z", scoreMs: 21000, finishedAt: "2026-08-10T10:00:21Z" }); // this season
  const [allTime] = await store.bestFinished(WS, SUB, 1);
  assert.equal(allTime.scoreMs, 28000);
  const [seasonBest] = await store.bestFinished(WS, SUB, 1, new Date("2026-07-01T00:00:00Z"));
  assert.equal(seasonBest.scoreMs, 21000);
});

test("leaderboard windowed by `since` is the season board", async () => {
  const store = new InMemoryGameStore();
  // Last season's monster score...
  await seedRun(store, { sub: "usr_old", startedAt: "2026-06-15T10:00:00Z", scoreMs: 30000, finishedAt: "2026-06-15T10:00:30Z" });
  // ...and this season's field.
  await seedRun(store, { sub: "usr_new", startedAt: "2026-08-10T10:00:00Z", scoreMs: 12000, finishedAt: "2026-08-10T10:00:12Z" });
  const q3start = new Date("2026-07-01T00:00:00Z");
  const season = await store.leaderboard(10, q3start);
  assert.deepEqual(season.map((r) => r.sub), ["usr_new"]); // old season aged out
  const allTime = await store.leaderboard(10);
  assert.deepEqual(allTime.map((r) => r.sub), ["usr_old", "usr_new"]); // still counts forever
});

test("leaderboard truncates to n", async () => {
  const store = new InMemoryGameStore();
  for (let i = 0; i < 5; i++) {
    await seedRun(store, { sub: `usr_${i}`, startedAt: "2026-08-01T10:00:00Z", scoreMs: 1000 * (i + 1) });
  }
  const board = await store.leaderboard(2);
  assert.deepEqual(board.map((r) => r.scoreMs), [5000, 4000]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeEntitlement } from "../entitlement/resolver";
import { UNLIMITED } from "../entitlement/quota";
import {
  FREE_DAILY_RUNS,
  MAX_SCORE_MS,
  QUALIFY_MS,
  callSign,
  dailyRunCap,
  dailyTrend,
  historyWindowFor,
  isValidScoreMs,
  nextUtcMidnight,
  outcomeForScore,
  remainingRuns,
  scoreFitsWallClock,
  seasonOf,
  utcDayStart,
} from "./rules";

test("free tier gets the product-default daily cap", () => {
  const e = makeEntitlement("ws", "vxtpl", { tier: "free" });
  assert.equal(dailyRunCap(e), FREE_DAILY_RUNS);
});

test("a platform-configured limit overrides the product default", () => {
  const e = makeEntitlement("ws", "vxtpl", {
    tier: "free",
    limits: { "vxtpl.game.runs_per_day": 25 },
  });
  assert.equal(dailyRunCap(e), 25);
});

test("starter and above are unlimited, and the platform limit is ignored there", () => {
  for (const tier of ["starter", "pro", "business", "enterprise"] as const) {
    const e = makeEntitlement("ws", "vxtpl", {
      tier,
      limits: { "vxtpl.game.runs_per_day": 25 },
    });
    assert.equal(dailyRunCap(e), UNLIMITED, tier);
  }
});

test("remainingRuns clamps at zero and passes UNLIMITED through", () => {
  assert.equal(remainingRuns(10, 3), 7);
  assert.equal(remainingRuns(10, 10), 0);
  assert.equal(remainingRuns(10, 14), 0);
  assert.equal(remainingRuns(UNLIMITED, 9999), UNLIMITED);
});

test("quota day boundaries are UTC midnight", () => {
  const now = new Date("2026-08-31T23:59:59.500Z");
  assert.equal(utcDayStart(now).toISOString(), "2026-08-31T00:00:00.000Z");
  assert.equal(nextUtcMidnight(now).toISOString(), "2026-09-01T00:00:00.000Z");
});

test("history window widens with the ladder", () => {
  assert.deepEqual(historyWindowFor(makeEntitlement("ws", "p", { tier: "free" })), { kind: "none" });
  assert.deepEqual(historyWindowFor(makeEntitlement("ws", "p", { tier: "starter" })), {
    kind: "last10",
    limit: 10,
  });
  assert.deepEqual(historyWindowFor(makeEntitlement("ws", "p", { tier: "pro" })), {
    kind: "days30",
    days: 30,
  });
  assert.deepEqual(historyWindowFor(makeEntitlement("ws", "p", { tier: null })), { kind: "none" });
});

test("score validation is open above the bar, bounded by the sanity cap", () => {
  assert.equal(isValidScoreMs(0), true);
  assert.equal(isValidScoreMs(QUALIFY_MS), true);
  assert.equal(isValidScoreMs(QUALIFY_MS + 1), true);
  assert.equal(isValidScoreMs(MAX_SCORE_MS), true);
  assert.equal(isValidScoreMs(MAX_SCORE_MS + 1), false);
  assert.equal(isValidScoreMs(-1), false);
  assert.equal(isValidScoreMs(12.5), false);
  assert.equal(isValidScoreMs("12000"), false);
});

test("reaching the bar makes the run qualified (stored as survived)", () => {
  assert.equal(outcomeForScore(QUALIFY_MS), "survived");
  assert.equal(outcomeForScore(QUALIFY_MS * 2), "survived");
  assert.equal(outcomeForScore(QUALIFY_MS - 1), "hit");
  assert.equal(outcomeForScore(0), "hit");
});

test("a score cannot exceed the observed wall clock plus slack", () => {
  const start = new Date("2026-08-31T10:00:00.000Z");
  const finishFast = new Date("2026-08-31T10:00:05.000Z"); // 5s of wall time
  assert.equal(scoreFitsWallClock(19000, start, finishFast), false);
  assert.equal(scoreFitsWallClock(5000, start, finishFast), true);
  const finishSlow = new Date("2026-08-31T10:00:25.000Z");
  assert.equal(scoreFitsWallClock(QUALIFY_MS, start, finishSlow), true);
});

test("seasons are natural quarters, UTC, with exclusive ends", () => {
  const q3 = seasonOf(new Date("2026-09-01T00:00:00Z"));
  assert.equal(q3.key, "2026Q3");
  assert.equal(q3.label, "2026 Q3");
  assert.equal(q3.start.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(q3.end.toISOString(), "2026-10-01T00:00:00.000Z");

  // The last instant of a quarter still belongs to it...
  assert.equal(seasonOf(new Date("2026-09-30T23:59:59.999Z")).key, "2026Q3");
  // ...and the first instant of the next one does not.
  assert.equal(seasonOf(new Date("2026-10-01T00:00:00.000Z")).key, "2026Q4");
  // Year rollover.
  assert.equal(seasonOf(new Date("2026-12-31T23:59:59Z")).key, "2026Q4");
  assert.equal(seasonOf(new Date("2027-01-01T00:00:00Z")).key, "2027Q1");
});

test("call signs are deterministic, anonymous, and ASCII", () => {
  const a = callSign("usr_11111111-2222-3333-4444-555555555555");
  const b = callSign("usr_11111111-2222-3333-4444-555555555555");
  const c = callSign("usr_99999999-8888-7777-6666-555555555555");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[A-Z]+-[0-9A-F]{4}$/);
  assert.ok(!a.includes("usr_"));
});

test("dailyTrend aggregates per UTC day, oldest first", () => {
  const runs = [
    { scoreMs: 5000, startedAt: new Date("2026-08-30T23:50:00Z") },
    { scoreMs: 9000, startedAt: new Date("2026-08-31T00:10:00Z") },
    { scoreMs: 3000, startedAt: new Date("2026-08-31T08:00:00Z") },
    { scoreMs: 20000, startedAt: new Date("2026-08-31T09:00:00Z") },
  ];
  const trend = dailyTrend(runs);
  assert.deepEqual(trend, [
    { day: "2026-08-30", bestMs: 5000, meanMs: 5000, count: 1 },
    { day: "2026-08-31", bestMs: 20000, meanMs: Math.round((9000 + 3000 + 20000) / 3), count: 3 },
  ]);
});

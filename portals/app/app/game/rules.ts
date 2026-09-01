import type { Entitlement } from "../entitlement/types";
import { canUseFeature } from "../entitlement/capability";
import { UNLIMITED, limitOf } from "../entitlement/quota";

// The challenge game's product rules (docs/20-specs/20-challenge-game.md), as
// pure functions over the C2 envelope and the run rows. Everything commercial
// stays platform-shaped: the tier ladder lives in CAPABILITY_MATRIX, a
// platform-configured limit beats the product default, and this file holds
// only what the product itself owns - durations, windows, and arithmetic.

/** The QUALIFYING bar, not the end (owner decision 2026-08-31): a run keeps
 * going past 20s with no ceiling - the score is however long you survive,
 * and 20.000s is the line that makes it a qualified run. The HUD progress
 * bar wraps on this period. */
export const QUALIFY_MS = 20000;

/** Server sanity ceiling on a reported score (10 minutes). The wall-clock
 * check already bounds honest scores; this bounds the column. */
export const MAX_SCORE_MS = 600000;

/** Product default for the free tier's daily quota. A platform-configured
 * `limits[DAILY_LIMIT_KEY]` overrides it (the platform's sales number wins);
 * the default exists so the game is playable the day the product ships,
 * before the platform carries the key. */
export const FREE_DAILY_RUNS = 10;

export const TOP_PIN_COUNT = 3;
export const HISTORY_LIMIT = 10;
export const TREND_DAYS = 30;

/** Both boards cap at the top 100 (owner decision 2026-09-01). */
export const LEADERBOARD_SIZE = 100;

/** Finish-phase slack: a reported score may exceed the server-observed wall
 * time by at most this much (network + countdown jitter). */
export const FINISH_SLACK_MS = 3000;

export const RUNS_METRIC = "vxtpl.game.runs";
export const DAILY_LIMIT_KEY = "vxtpl.game.runs_per_day";

// --- daily quota ---------------------------------------------------------

/** The quota day is the UTC day: stated in the UI, uniform for every player. */
export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function nextUtcMidnight(now: Date): Date {
  const start = utcDayStart(now);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/** Runs-per-day cap for this entitlement. UNLIMITED (-1) once the tier holds
 * `game:unlimited-runs`; below that, the platform limit if configured, else
 * the product default. */
export function dailyRunCap(e: Entitlement): number {
  if (canUseFeature(e, "game:unlimited-runs")) return UNLIMITED;
  return limitOf(e, DAILY_LIMIT_KEY) ?? FREE_DAILY_RUNS;
}

/** Remaining runs today given the cap and today's started-run count. */
export function remainingRuns(cap: number, usedToday: number): number {
  if (cap === UNLIMITED) return UNLIMITED;
  return Math.max(0, cap - usedToday);
}

// --- history window ------------------------------------------------------

export type HistoryWindow =
  | { kind: "none" }
  | { kind: "last10"; limit: number }
  | { kind: "days30"; days: number };

/** What slice of their own record a player may see. Pro's 30-day window
 * supersedes starter's last-10 (the ladder is cumulative, the WINDOW is not -
 * it widens). */
export function historyWindowFor(e: Entitlement): HistoryWindow {
  if (canUseFeature(e, "game:trend")) return { kind: "days30", days: TREND_DAYS };
  if (canUseFeature(e, "game:history")) return { kind: "last10", limit: HISTORY_LIMIT };
  return { kind: "none" };
}

// --- score validation ----------------------------------------------------

export function isValidScoreMs(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_SCORE_MS;
}

/** Every run ends on a hit; reaching the bar first makes it a QUALIFIED run.
 * The stored value stays 'survived' (the DB check predates the unbounded
 * score); read it as "qualified". */
export function outcomeForScore(scoreMs: number): "survived" | "hit" {
  return scoreMs >= QUALIFY_MS ? "survived" : "hit";
}

/** The reported score cannot exceed the wall time the server observed between
 * start and finish (plus slack). The client is trusted for WHERE the bullets
 * were, never for how long the clock ran. */
export function scoreFitsWallClock(scoreMs: number, startedAt: Date, finishedAt: Date): boolean {
  return scoreMs <= finishedAt.getTime() - startedAt.getTime() + FINISH_SLACK_MS;
}

// --- seasons --------------------------------------------------------------

export interface Season {
  key: string; // "2026Q3"
  label: string; // "2026 Q3"
  start: Date; // inclusive, UTC
  end: Date; // exclusive, UTC (= next season's start)
}

/**
 * Seasons are NATURAL QUARTERS, UTC (owner decision 2026-09-01). The season
 * board shows only the CURRENT season and expired seasons are not archived -
 * the season board is simply "the all-time query windowed to this quarter",
 * so a season "ends" by its runs aging out of the window, not by a job.
 */
export function seasonOf(now: Date): Season {
  const year = now.getUTCFullYear();
  const q = Math.floor(now.getUTCMonth() / 3); // 0..3
  return {
    key: `${year}Q${q + 1}`,
    label: `${year} Q${q + 1}`,
    start: new Date(Date.UTC(year, q * 3, 1)),
    end: new Date(Date.UTC(year, q * 3 + 3, 1)),
  };
}

// --- leaderboard call signs ----------------------------------------------

const CALL_WORDS = [
  "NOVA", "VECTOR", "PULSE", "ORBIT", "QUARK", "RIDGE", "DELTA", "ONYX",
  "FLUX", "COMET", "RAPTOR", "ZENITH", "EMBER", "TALON", "DRIFT", "PRISM",
  "SABLE", "KILO", "AZURE", "BOLT", "CINDER", "HALO", "IONIC", "LUMEN",
] as const;

/**
 * Deterministic, anonymous handle for the global leaderboard. The board is the
 * one surface that crosses workspaces, so it must carry nothing a viewer could
 * correlate back to an account: no sub, no display name, no workspace. A call
 * sign derived from the sub is stable for the player ("that is me, again") and
 * meaningless to everyone else.
 */
export function callSign(sub: string): string {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < sub.length; i++) {
    h ^= sub.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const u = h >>> 0;
  const word = CALL_WORDS[u % CALL_WORDS.length];
  const tag = u.toString(16).toUpperCase().padStart(8, "0").slice(0, 4);
  return `${word}-${tag}`;
}

// --- trend aggregation (pro) ---------------------------------------------

export interface FinishedRun {
  scoreMs: number;
  startedAt: Date;
}

export interface TrendPoint {
  day: string; // "YYYY-MM-DD" (UTC)
  bestMs: number;
  meanMs: number;
  count: number;
}

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Per-UTC-day best/mean/count over the given finished runs, oldest day first.
 * Days without a run are simply absent - the chart plots on a date scale, so a
 * gap reads as a gap rather than a zero score. */
export function dailyTrend(runs: readonly FinishedRun[]): TrendPoint[] {
  const byDay = new Map<string, { best: number; sum: number; count: number }>();
  for (const r of runs) {
    const key = utcDayKey(r.startedAt);
    const agg = byDay.get(key) ?? { best: 0, sum: 0, count: 0 };
    agg.best = Math.max(agg.best, r.scoreMs);
    agg.sum += r.scoreMs;
    agg.count += 1;
    byDay.set(key, agg);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, a]) => ({ day, bestMs: a.best, meanMs: Math.round(a.sum / a.count), count: a.count }));
}

/** "13.42" - seconds with centisecond precision, the game's display unit. */
export function formatScoreMs(ms: number): string {
  return (ms / 1000).toFixed(2);
}

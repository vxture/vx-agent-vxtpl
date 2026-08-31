import { RUN_DURATION_MS } from "./rules";

// The bullet-field engine: pure state + advance(), no DOM and no canvas, so the
// whole difficulty curve is unit-testable and a run is reproducible from its
// seed. The renderer (challenge/game-view.tsx) owns input and drawing only.
//
// Coordinates are LOGICAL: a fixed 800x520 arena that the renderer scales to
// the actual canvas. Keeping the space fixed means difficulty is identical on a
// phone and a desktop - a smaller screen scales the picture, not the game.

export const ARENA_W = 800;
export const ARENA_H = 520;
export const PLAYER_R = 4;

/** Arrow-key movement speed (logical px/s). Slightly faster than the fastest
 * bullet, and that margin IS the game: you can always outrun a shot you saw,
 * so every death is a positioning mistake, never a speed check. Owner-tuned
 * 2026-08-31: the fun is dodging craft, not reflexes. */
export const PLAYER_SPEED = 150;

const BULLET_R_MIN = 2;
const BULLET_R_MAX = 3.2;
const CULL_MARGIN = 48;

// Cadence and speed, owner-tuned 2026-08-31: everything SLOW and AIMED. The
// ramp raises density (spawn interval), barely speed - slow bullets live
// longer on screen, so the field thickens on its own and the difficulty
// becomes reading converging lanes, not outrunning them.
const SPAWN_INTERVAL_START_MS = 320;
const SPAWN_INTERVAL_END_MS = 70;
const SPEED_START = 60; // logical px/s
const SPEED_END = 130;

// Ring bursts: converging circles at fixed moments - the run's set pieces. A
// player who has seen one run knows when to brace, which is what makes a 20s
// game replayable rather than random.
const BURSTS: { at: number; count: number; speed: number }[] = [
  { at: 6000, count: 12, speed: 80 },
  { at: 11000, count: 16, speed: 88 },
  { at: 15500, count: 20, speed: 96 },
  { at: 18200, count: 24, speed: 105 },
];

export interface Vec {
  x: number;
  y: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export type EngineStatus = "running" | "hit" | "survived";

export interface EngineState {
  t: number; // elapsed ms
  status: EngineStatus;
  bullets: Bullet[];
  nextSpawnAt: number;
  burstsFired: number;
  spawned: number; // total bullets ever spawned (telemetry + tests)
  rand: () => number;
}

/** mulberry32 over the first 8 hex chars of the server-issued seed. */
export function seededRandom(seedHex: string): () => number {
  let a = Number.parseInt(seedHex.slice(0, 8).padEnd(8, "0"), 16) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function spawnIntervalAt(t: number): number {
  const f = Math.min(1, t / RUN_DURATION_MS);
  return SPAWN_INTERVAL_START_MS + (SPAWN_INTERVAL_END_MS - SPAWN_INTERVAL_START_MS) * f;
}

export function bulletSpeedAt(t: number): number {
  const f = Math.min(1, t / RUN_DURATION_MS);
  return SPEED_START + (SPEED_END - SPEED_START) * f;
}

export function createEngine(seedHex: string): EngineState {
  return {
    t: 0,
    status: "running",
    bullets: [],
    nextSpawnAt: 600, // a breath before the first bullet
    burstsFired: 0,
    spawned: 0,
    rand: seededRandom(seedHex),
  };
}

/** A bullet on the arena edge, aimed EXACTLY at the player's position at fire
 * time, then flying straight - no jitter, no homing. Aimed fire is what makes
 * the field readable: standing still is lethal, and any deliberate move
 * invalidates every shot already in the air. Randomness stays where it
 * belongs - in WHERE the shot comes from, never in where it goes. */
function spawnAimed(state: EngineState, player: Vec): void {
  const rand = state.rand;
  const edge = Math.floor(rand() * 4);
  let x: number, y: number;
  if (edge === 0) {
    x = rand() * ARENA_W;
    y = -CULL_MARGIN / 2;
  } else if (edge === 1) {
    x = ARENA_W + CULL_MARGIN / 2;
    y = rand() * ARENA_H;
  } else if (edge === 2) {
    x = rand() * ARENA_W;
    y = ARENA_H + CULL_MARGIN / 2;
  } else {
    x = -CULL_MARGIN / 2;
    y = rand() * ARENA_H;
  }
  const angle = Math.atan2(player.y - y, player.x - x);
  const speed = bulletSpeedAt(state.t) * (0.9 + rand() * 0.2);
  state.bullets.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: BULLET_R_MIN + rand() * (BULLET_R_MAX - BULLET_R_MIN),
  });
  state.spawned++;
}

/** A ring converging on the player's position at fire time. */
function spawnBurst(state: EngineState, player: Vec, count: number, speed: number): void {
  const rand = state.rand;
  const phase = rand() * Math.PI * 2;
  const radius = Math.hypot(ARENA_W, ARENA_H) / 2 + CULL_MARGIN / 2;
  const cx = ARENA_W / 2;
  const cy = ARENA_H / 2;
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    const aim = Math.atan2(player.y - y, player.x - x);
    state.bullets.push({
      x,
      y,
      vx: Math.cos(aim) * speed,
      vy: Math.sin(aim) * speed,
      r: BULLET_R_MIN + rand() * (BULLET_R_MAX - BULLET_R_MIN),
    });
    state.spawned++;
  }
}

/**
 * Advance the simulation by dtMs with the player at `player`. Mutates and
 * returns the state. Terminal states latch: once hit or survived, advance is a
 * no-op.
 */
export function advance(state: EngineState, dtMs: number, player: Vec): EngineState {
  if (state.status !== "running") return state;

  // Fixed 120Hz substeps so collision cannot tunnel through a frame hitch: a
  // background tab handing us dt=800ms must not let a bullet jump the player.
  let remaining = dtMs;
  while (remaining > 0 && state.status === "running") {
    const dt = Math.min(remaining, 1000 / 120);
    remaining -= dt;
    step(state, dt, player);
  }
  return state;
}

function step(state: EngineState, dt: number, player: Vec): void {
  state.t += dt;

  if (state.t >= RUN_DURATION_MS) {
    state.t = RUN_DURATION_MS;
    state.status = "survived";
    return;
  }

  while (state.t >= state.nextSpawnAt) {
    spawnAimed(state, player);
    state.nextSpawnAt += spawnIntervalAt(state.t);
  }
  while (state.burstsFired < BURSTS.length && state.t >= BURSTS[state.burstsFired].at) {
    const b = BURSTS[state.burstsFired];
    spawnBurst(state, player, b.count, b.speed);
    state.burstsFired++;
  }

  const s = dt / 1000;
  let write = 0;
  for (let i = 0; i < state.bullets.length; i++) {
    const b = state.bullets[i];
    b.x += b.vx * s;
    b.y += b.vy * s;
    if (
      b.x < -CULL_MARGIN ||
      b.x > ARENA_W + CULL_MARGIN ||
      b.y < -CULL_MARGIN ||
      b.y > ARENA_H + CULL_MARGIN
    ) {
      continue; // culled
    }
    state.bullets[write++] = b;
    const dx = b.x - player.x;
    const dy = b.y - player.y;
    const rr = b.r + PLAYER_R;
    if (dx * dx + dy * dy < rr * rr) {
      state.status = "hit";
    }
  }
  state.bullets.length = write;
}

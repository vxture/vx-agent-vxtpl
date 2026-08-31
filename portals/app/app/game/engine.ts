import { QUALIFY_MS } from "./rules";

// The bullet-field engine: pure state + advance(), no DOM and no canvas, so the
// whole difficulty curve is unit-testable and a run is reproducible from its
// seed. The renderer (deck/game-view.tsx) owns input and drawing only.
//
// Coordinates are LOGICAL: a fixed 800x520 arena that the renderer scales to
// the actual canvas. Keeping the space fixed means difficulty is identical on a
// phone and a desktop - a smaller screen scales the picture, not the game.
//
// A run has NO end but the hit (owner decision 2026-08-31): 20s is the
// qualifying bar, not a finish line. The curves ramp to their 20s values,
// then density keeps creeping (never speed) and the ring bursts turn
// periodic - the field slowly closes until the inevitable.

export const ARENA_W = 800;
export const ARENA_H = 520;
export const PLAYER_R = 4;

/** Arrow-key movement speed (logical px/s). Still faster than any bullet -
 * you can always outrun a shot you saw, so every death is a positioning
 * mistake, never a speed check. Owner-tuned twice (2026-08-31): SLOW and
 * DENSE - threading gaps deliberately, not twitching between them. */
export const PLAYER_SPEED = 110;

const BULLET_R_MIN = 2;
const BULLET_R_MAX = 3.2;
const CULL_MARGIN = 48;

// Cadence: density does the ramping, speed barely moves. Slow bullets live
// long, so the on-screen count compounds - the "surviving through the slits"
// feel is many slow lanes, not few fast ones. Past the bar the interval
// keeps shrinking gently to a floor; speed never grows past its 20s value.
const SPAWN_INTERVAL_START_MS = 240;
const SPAWN_INTERVAL_QUALIFY_MS = 55;
const SPAWN_INTERVAL_FLOOR_MS = 42;
const SPEED_START = 45; // logical px/s
const SPEED_QUALIFY = 85;

// Ring bursts: converging circles at fixed moments - the first lap's set
// pieces. A player who has seen one run knows when to brace, which is what
// makes the game replayable rather than random.
const BURSTS: { at: number; count: number; speed: number }[] = [
  { at: 6000, count: 14, speed: 55 },
  { at: 11000, count: 18, speed: 60 },
  { at: 15500, count: 22, speed: 66 },
  { at: 18200, count: 26, speed: 72 },
];

// Past the bar, the bursts turn periodic: one every encore interval.
const ENCORE_FIRST_AT = QUALIFY_MS + 4000;
const ENCORE_EVERY_MS = 6000;
const ENCORE_COUNT = 26;
const ENCORE_SPEED = 70;

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

export type EngineStatus = "running" | "hit";

export interface EngineState {
  t: number; // elapsed ms
  status: EngineStatus;
  bullets: Bullet[];
  nextSpawnAt: number;
  burstsFired: number;
  nextEncoreAt: number;
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
  if (t <= QUALIFY_MS) {
    const f = t / QUALIFY_MS;
    return SPAWN_INTERVAL_START_MS + (SPAWN_INTERVAL_QUALIFY_MS - SPAWN_INTERVAL_START_MS) * f;
  }
  // second lap: creep from the qualify value down to the floor, then hold
  const f = Math.min(1, (t - QUALIFY_MS) / QUALIFY_MS);
  return SPAWN_INTERVAL_QUALIFY_MS + (SPAWN_INTERVAL_FLOOR_MS - SPAWN_INTERVAL_QUALIFY_MS) * f;
}

export function bulletSpeedAt(t: number): number {
  const f = Math.min(1, t / QUALIFY_MS);
  return SPEED_START + (SPEED_QUALIFY - SPEED_START) * f;
}

export function createEngine(seedHex: string): EngineState {
  return {
    t: 0,
    status: "running",
    bullets: [],
    nextSpawnAt: 600, // a breath before the first bullet
    burstsFired: 0,
    nextEncoreAt: ENCORE_FIRST_AT,
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
 * returns the state. The hit latches: once hit, advance is a no-op.
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

  while (state.t >= state.nextSpawnAt) {
    spawnAimed(state, player);
    state.nextSpawnAt += spawnIntervalAt(state.t);
  }
  while (state.burstsFired < BURSTS.length && state.t >= BURSTS[state.burstsFired].at) {
    const b = BURSTS[state.burstsFired];
    spawnBurst(state, player, b.count, b.speed);
    state.burstsFired++;
  }
  while (state.t >= state.nextEncoreAt) {
    spawnBurst(state, player, ENCORE_COUNT, ENCORE_SPEED);
    state.nextEncoreAt += ENCORE_EVERY_MS;
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

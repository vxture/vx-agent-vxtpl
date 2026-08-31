import { test } from "node:test";
import assert from "node:assert/strict";
import { RUN_DURATION_MS } from "./rules";
import {
  ARENA_H,
  ARENA_W,
  PLAYER_R,
  advance,
  bulletSpeedAt,
  createEngine,
  seededRandom,
  spawnIntervalAt,
  type EngineState,
} from "./engine";

// A player parked far outside the arena: bullets aim at it but can never touch
// it before culling, so the sim runs the full 20s deterministically.
const FAR_AWAY = { x: -100000, y: -100000 };

function runFor(state: EngineState, ms: number, player = FAR_AWAY): EngineState {
  for (let t = 0; t < ms; t += 16) advance(state, 16, player);
  return state;
}

test("seededRandom is deterministic per seed", () => {
  const a = seededRandom("deadbeefcafe");
  const b = seededRandom("deadbeefcafe");
  const c = seededRandom("0badf00d0000");
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, [c(), c(), c()]);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test("same seed + same inputs = the same run", () => {
  const s1 = runFor(createEngine("cafebabe1234"), 5000);
  const s2 = runFor(createEngine("cafebabe1234"), 5000);
  assert.equal(s1.spawned, s2.spawned);
  assert.deepEqual(s1.bullets, s2.bullets);
});

test("difficulty ramps: spawn interval shrinks, speed grows", () => {
  assert.ok(spawnIntervalAt(0) > spawnIntervalAt(10000));
  assert.ok(spawnIntervalAt(10000) > spawnIntervalAt(RUN_DURATION_MS));
  assert.ok(bulletSpeedAt(0) < bulletSpeedAt(RUN_DURATION_MS));
});

test("the last two seconds spawn more than the first two", () => {
  const state = createEngine("cafebabe1234");
  runFor(state, 2000);
  const early = state.spawned;
  runFor(state, RUN_DURATION_MS - 4000);
  const beforeLate = state.spawned;
  runFor(state, 1990);
  const late = state.spawned - beforeLate;
  assert.ok(late > early, `late window ${late} should out-spawn early window ${early}`);
});

test("an untouched player survives at exactly the run duration", () => {
  const state = runFor(createEngine("cafebabe1234"), RUN_DURATION_MS + 100);
  assert.equal(state.status, "survived");
  assert.equal(state.t, RUN_DURATION_MS);
});

test("a bullet overlapping the player is a hit, and the state latches", () => {
  const state = createEngine("cafebabe1234");
  const player = { x: ARENA_W / 2, y: ARENA_H / 2 };
  state.bullets.push({ x: player.x + PLAYER_R, y: player.y, vx: 0, vy: 0, r: 4 });
  advance(state, 16, player);
  assert.equal(state.status, "hit");
  const tAtHit = state.t;
  advance(state, 1000, player);
  assert.equal(state.status, "hit");
  assert.equal(state.t, tAtHit);
});

test("a huge frame delta cannot tunnel a bullet through the player", () => {
  const state = createEngine("cafebabe1234");
  const player = { x: 400, y: 260 };
  // Fast bullet pointed straight at the player from the left; one 500ms frame
  // would carry it far past if integrated in a single step. r=6 keeps the
  // collision window wider than one 120Hz substep at this speed, so the hit
  // cannot depend on step phase.
  state.bullets.push({ x: 300, y: 260, vx: 2000, vy: 0, r: 6 });
  advance(state, 500, player);
  assert.equal(state.status, "hit");
});

test("every aimed bullet flies straight at where the player stood", () => {
  const state = createEngine("cafebabe1234");
  const player = { x: 500, y: 200 };
  // Tiny steps so freshly spawned bullets have barely moved when checked -
  // and a bullet moving ALONG its aim line keeps pointing at the target.
  for (let t = 0; t < 700; t += 8) advance(state, 8, player);
  assert.ok(state.bullets.length > 0, "expected at least one spawn by 700ms");
  for (const b of state.bullets) {
    const speed = Math.hypot(b.vx, b.vy);
    const dist = Math.hypot(player.x - b.x, player.y - b.y);
    const cos = ((player.x - b.x) * b.vx + (player.y - b.y) * b.vy) / (speed * dist);
    assert.ok(cos > 0.9995, `bullet veers off target (cos ${cos})`);
  }
});

test("bullets leaving the arena are culled", () => {
  const state = createEngine("cafebabe1234");
  state.bullets.push({ x: 5, y: 5, vx: -4000, vy: -4000, r: 4 });
  advance(state, 200, FAR_AWAY);
  assert.equal(state.bullets.filter((b) => b.x < -100).length, 0);
});

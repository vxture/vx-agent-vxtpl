import { test } from "node:test";
import assert from "node:assert/strict";
import { QUALIFY_MS } from "./rules";
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

test("difficulty ramps: spawn interval shrinks, speed grows to the bar", () => {
  assert.ok(spawnIntervalAt(0) > spawnIntervalAt(10000));
  assert.ok(spawnIntervalAt(10000) > spawnIntervalAt(QUALIFY_MS));
  assert.ok(bulletSpeedAt(0) < bulletSpeedAt(QUALIFY_MS));
});

test("past the bar, density keeps creeping but speed holds", () => {
  assert.ok(spawnIntervalAt(QUALIFY_MS) > spawnIntervalAt(QUALIFY_MS * 2));
  assert.ok(spawnIntervalAt(QUALIFY_MS * 2) >= spawnIntervalAt(QUALIFY_MS * 3)); // floor
  assert.equal(bulletSpeedAt(QUALIFY_MS), bulletSpeedAt(QUALIFY_MS * 3));
});

test("the last two seconds before the bar out-spawn the first two", () => {
  const state = createEngine("cafebabe1234");
  runFor(state, 2000);
  const early = state.spawned;
  runFor(state, QUALIFY_MS - 4000);
  const beforeLate = state.spawned;
  runFor(state, 1990);
  const late = state.spawned - beforeLate;
  assert.ok(late > early, `late window ${late} should out-spawn early window ${early}`);
});

test("the bar is not the end: an untouched run keeps going past 20s", () => {
  const state = runFor(createEngine("cafebabe1234"), QUALIFY_MS + 6000);
  assert.equal(state.status, "running");
  assert.ok(state.t > QUALIFY_MS, `t ${state.t} should pass the bar`);
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

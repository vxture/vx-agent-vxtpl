/**
 * Covers local time boundaries and product headline overrides.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Tests
 * @author AI-Generated
 * @date 2026-11-26
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { createHeadlineRotation, headlineSlot, parseHeadlineSettings } from "./headline-rotation";

test("the default changes at local midnight and visits the whole pool", () => {
  const settings = parseHeadlineSettings();
  const rotate = createHeadlineRotation(settings, "headline-test");
  assert.equal(settings.pool.length, 12);
  assert.equal(settings.intervalMinutes, 1440);
  const origin = new Date(2026, 10, 26, 12);
  const before = new Date(2026, 10, 26, 23, 59, 59);
  const after = new Date(2026, 10, 27, 0, 0, 0);
  assert.equal(rotate.current(origin), rotate.current(before));
  assert.notEqual(rotate.current(before), rotate.current(after));
  assert.equal(headlineSlot(settings, before).nextAt, after.getTime());
  const titles = settings.pool.map((_, offset) => rotate.current(new Date(2026, 10, 26 + offset, 12)));
  assert.deepEqual(new Set(titles), new Set(settings.pool));
});

test("products can extend the pool and choose shorter intervals", () => {
  const pool = Array.from({ length: 15 }, (_, index) => `Title ${index}\u3002`);
  const settings = parseHeadlineSettings({ pool, intervalMinutes: 95 });
  assert.equal(settings.pool.at(-1), "Title 14");

  const before = new Date(2026, 10, 26, 1, 34, 59);
  const after = new Date(2026, 10, 26, 1, 35, 0);
  assert.equal(headlineSlot(settings, before).nextAt, after.getTime());
  assert.notEqual(headlineSlot(settings, before).index, headlineSlot(settings, after).index);

  const endOfDay = new Date(2026, 10, 26, 23, 59, 59);
  const tomorrow = new Date(2026, 10, 27);
  assert.equal(headlineSlot(settings, endOfDay).nextAt, tomorrow.getTime());
  assert.notEqual(headlineSlot(settings, endOfDay).index, headlineSlot(settings, tomorrow).index);
});

test("invalid intervals and duplicate titles fail during configuration", () => {
  for (const intervalMinutes of [0, 1441, 1.5, "60", null]) {
    assert.throws(() => parseHeadlineSettings({ intervalMinutes }), /intervalMinutes/);
  }
  assert.throws(() => parseHeadlineSettings({ pool: ["one", "two"] }), /at least 10/);
  assert.throws(() => parseHeadlineSettings({ pool: Array(12).fill("same") }), /distinct/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { flushUsage } from "./flush";
import { InMemoryUsageStore } from "./store";

async function seeded(): Promise<InMemoryUsageStore> {
  const s = new InMemoryUsageStore();
  await s.record({ workspaceId: "ws", metric: "ai.credit", amount: 1, idempotencyKey: "k1" });
  await s.record({ workspaceId: "ws", metric: "ai.credit", amount: 2, idempotencyKey: "k2" });
  return s;
}

test("200 marks rows flushed", async () => {
  const store = await seeded();
  const summary = await flushUsage({ store, consume: async () => ({ status: 200, body: {} }) });
  assert.equal(summary.flushed, 2);
  assert.equal((await store.unflushed(10)).length, 0);
});

// The consume contract (integration general rules, C3 up): ALWAYS 200; gated
// rides in the body as information. The old 409 shape is retired.
test("200 + gated:true is recorded (flushed), counted, and evicts C2", async () => {
  const store = await seeded();
  const evicted: string[] = [];
  const summary = await flushUsage({
    store,
    consume: async () => ({ status: 200, body: { gated: true, reason: "quota_exhausted" } }),
    onGated: (ws) => evicted.push(ws),
  });
  assert.equal(summary.flushed, 2);
  assert.equal(summary.gated, 2);
  assert.equal((await store.unflushed(10)).length, 0); // recorded, not retried
  assert.deepEqual(evicted, ["ws", "ws"]);
});

test("200 + replayed:true counts the idempotent redo", async () => {
  const store = await seeded();
  const summary = await flushUsage({
    store,
    consume: async () => ({ status: 200, body: { replayed: true, event_id: "evt_1" } }),
  });
  assert.equal(summary.flushed, 2);
  assert.equal(summary.replayed, 2);
  assert.equal(summary.gated, 0);
});

test("non-200 (409 included - the retired shape) leaves rows buffered for retry", async () => {
  const store = await seeded();
  const summary = await flushUsage({ store, consume: async () => ({ status: 409 }) });
  assert.equal(summary.retried, 2);
  assert.equal(summary.flushed, 0);
  assert.equal((await store.unflushed(10)).length, 2); // still buffered
});

test("5xx leaves rows buffered for retry", async () => {
  const store = await seeded();
  const summary = await flushUsage({ store, consume: async () => ({ status: 500 }) });
  assert.equal(summary.retried, 2);
  assert.equal((await store.unflushed(10)).length, 2);
});

test("a thrown consume error leaves rows buffered", async () => {
  const store = await seeded();
  const summary = await flushUsage({
    store,
    consume: async () => {
      throw new Error("network");
    },
  });
  assert.equal(summary.retried, 2);
  assert.equal((await store.unflushed(10)).length, 2);
});

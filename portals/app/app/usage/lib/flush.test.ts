import { test } from "node:test";
import assert from "node:assert/strict";
import { flushUsage, makePlatformConsume } from "./flush";
import { InMemoryUsageStore } from "./store";
import { resetS2STokenCache } from "../../lib/s2s-token";

async function seeded(): Promise<InMemoryUsageStore> {
  const s = new InMemoryUsageStore();
  await s.record({ workspaceId: "ws", metric: "ai.credit", amount: 1, idempotencyKey: "k1" });
  await s.record({ workspaceId: "ws", metric: "ai.credit", amount: 2, idempotencyKey: "k2" });
  return s;
}

test("200 marks rows flushed", async () => {
  const store = await seeded();
  const summary = await flushUsage({
    store,
    consume: async () => ({ status: 200, body: { gated: false, event_id: "evt_1" } }),
    invalidate: async () => {},
  });
  assert.equal(summary.flushed, 2);
  assert.equal((await store.unflushed(10)).length, 0);
});

test("200 + gated:true is recorded (flushed), counted, and evicts C2", async () => {
  const store = await seeded();
  const evicted: string[] = [];
  const summary = await flushUsage({
    store,
    consume: async () => ({ status: 200, body: { gated: true, event_id: "evt_1" } }),
    invalidate: async (ws) => { evicted.push(ws); },
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
    consume: async () => ({ status: 200, body: { gated: false, replayed: true, event_id: "evt_1" } }),
    invalidate: async () => {},
  });
  assert.equal(summary.flushed, 2);
  assert.equal(summary.replayed, 2);
  assert.equal(summary.gated, 0);
});

test("non-200 leaves rows buffered for retry", async () => {
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

test("service-ticket refusal or an ambiguous receipt preserves the exact usage for replay", async (t) => {
  const previousFetch = globalThis.fetch;
  const settings = { OIDC_ISSUER: "http://127.0.0.1:8101", OIDC_CLIENT_ID: "vxtpl", OIDC_CLIENT_SECRET: "test-secret" };
  const previousEnv = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetS2STokenCache();
  });

  const store = new InMemoryUsageStore();
  const accountId = "7f1d1a1e-0000-4000-8000-00000000abcd";
  const record = { workspaceId: "ws", metric: "vxtpl.chat.messages", amount: 2, idempotencyKey: "original-key", endUserId: `usr_${accountId}` };
  await store.record(record);
  let mode: "refused" | "wrong-workspace" | "ambiguous" | "valid" = "refused";
  let sent = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oidc/token") {
      const form = new URLSearchParams(String(init?.body));
      assert.equal(form.get("workspace_id"), record.workspaceId);
      assert.equal(form.get("audience"), "vxture");
      assert.equal(form.has("subject_token"), false);
      if (mode === "refused") return Response.json({ error: "invalid_target" }, { status: 400 });
      const claims = {
        aud: "vxture", scope: "tool:vxture", act: { sub: "vxtpl" }, mode: "service",
        workspace_id: mode === "wrong-workspace" ? "other" : record.workspaceId,
      };
      return Response.json({ access_token: "fixture." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".signature", expires_in: 300 });
    }
    assert.equal(url.pathname, "/usage/consume");
    sent++;
    const headers = new Headers(init?.headers);
    assert.match(headers.get("authorization") ?? "", /^Bearer fixture\./);
    assert.equal(headers.has("x-vxture-internal-auth"), false);
    assert.equal(headers.get("x-request-id"), record.idempotencyKey);
    assert.deepEqual(JSON.parse(String(init?.body)), {
      workspace_id: record.workspaceId, product: "vxtpl", metric: record.metric,
      amount: record.amount, idempotency_key: record.idempotencyKey, end_user_id: accountId,
    });
    return Response.json(mode === "ambiguous" ? { gated: false } : { gated: false, event_id: "fixed-receipt", replayed: true });
  };

  let redisFails = true;
  const opts = {
    store, consume: makePlatformConsume("http://127.0.0.1:8102"),
    invalidate: async () => { if (redisFails) throw new Error("Redis unavailable"); },
  };
  for (const outcome of ["refused", "wrong-workspace", "ambiguous", "valid"] as const) {
    mode = outcome;
    resetS2STokenCache();
    assert.equal((await flushUsage(opts)).retried, 1);
    assert.deepEqual(await store.unflushed(10), [{ ...record, flushed: false }]);
  }
  assert.equal(sent, 2);
  redisFails = false;
  assert.equal((await flushUsage(opts)).replayed, 1);
  assert.equal(sent, 3);
  assert.deepEqual(await store.unflushed(10), []);
});

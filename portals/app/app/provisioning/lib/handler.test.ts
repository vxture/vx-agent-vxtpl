import { test } from "node:test";
import assert from "node:assert/strict";
import { handleProvisioning, type ProvisioningEvent } from "./handler";
import { InMemoryProvisioningStore } from "./store";

const PRODUCT = "raven";

function ev(over: Partial<ProvisioningEvent>): ProvisioningEvent {
  return {
    id: "d1",
    type: "tenant.provisioned",
    seq: 1,
    workspace_id: "ws_1",
    application: PRODUCT,
    ...over,
  };
}

function deps(over: Partial<Parameters<typeof handleProvisioning>[1]> = {}) {
  return { store: new InMemoryProvisioningStore(), product: PRODUCT, ...over };
}

test("provisioned is handled once; a duplicate delivery is a no-op", async () => {
  const d = deps();
  const first = await handleProvisioning(ev({ id: "d1", seq: 1 }), d);
  assert.equal(first.handled, true);
  const dup = await handleProvisioning(ev({ id: "d1", seq: 1 }), d);
  assert.equal(dup.handled, false);
  assert.equal(dup.reason, "duplicate");
});

test("a stale/earlier seq is ignored", async () => {
  const d = deps();
  await handleProvisioning(ev({ id: "a", seq: 5 }), d);
  const stale = await handleProvisioning(ev({ id: "b", seq: 3 }), d);
  assert.equal(stale.handled, false);
  assert.equal(stale.reason, "stale");
});

test("an event for another product is rejected", async () => {
  const res = await handleProvisioning(ev({ application: "other" }), deps());
  assert.equal(res.reason, "wrong-product");
});

test("subscription_changed evicts the C2 cache", async () => {
  let evicted: string | null = null;
  await handleProvisioning(
    ev({ id: "s1", type: "subscription_changed", seq: 2, workspace_id: "ws_9" }),
    deps({ onSubscriptionChanged: (ws) => { evicted = ws; } }),
  );
  assert.equal(evicted, "ws_9");
});

test("a redelivered notification retries eviction after the delivery was committed", async () => {
  const event = ev({ id: "invalidate-on-retry", type: "subscription_changed" });
  let fail = true;
  let evictions = 0;
  const d = deps({
    onSubscriptionChanged: async () => {
      if (fail) throw new Error("Redis unavailable");
      evictions++;
    },
  });
  await assert.rejects(handleProvisioning(event, d), /Redis unavailable/);
  fail = false;
  assert.equal((await handleProvisioning(event, d)).reason, "duplicate");
  assert.equal(evictions, 1);
});

test("provisioned runs the re-entrant init hook", async () => {
  let inited: string | null = null;
  const res = await handleProvisioning(
    ev({ id: "p1", type: "tenant.provisioned" }),
    deps({ onProvisioned: (ws) => { inited = ws; } }),
  );
  assert.equal(res.handled, true);
  assert.equal(inited, "ws_1");
});

test("an unversioned invalidation and a failed transaction cannot consume the lifecycle sequence", async () => {
  const d = deps();
  await handleProvisioning(ev({ type: "subscription_changed", id: "notice", seq: 9 }), d);
  await assert.rejects(handleProvisioning(ev({ seq: 2 }), {
    ...d,
    onProvisioned: () => { throw new Error("initialization failed"); },
  }), /initialization failed/);
  const [started, stopped] = await Promise.all([
    handleProvisioning(ev({ seq: 2 }), d),
    handleProvisioning(ev({ id: "revoke", seq: 3, type: "tenant.deprovisioned" }), d),
  ]);
  assert.equal(started.handled, true);
  assert.equal(stopped.handled, true);
  assert.equal(await d.store.instanceStatus("ws_1", PRODUCT), "deprovisioned");
  assert.equal(await d.store.isCurrentProvisioned(started.change!), false);
});

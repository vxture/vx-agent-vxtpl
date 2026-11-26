/**
 * Redis-backed notifications for live RP session streams.
 * @package @vxtpl/app
 * @layer Application
 * @category Session
 * @author AI-Generated
 * @date 2026-11-26
 */

import { getSession, rpRedis, sessionEventChannel } from "./session-store";

type Watch = { rpsid: string; revoked: () => void };
const hubs = new Map<string, ReturnType<typeof createHub>>();

function createHub(clientId: string) {
  const watchers = new Map<string, Set<Watch>>();
  const channel = sessionEventChannel(clientId);
  const subscriber = rpRedis().duplicate({ lazyConnect: true, autoResubscribe: false });
  let subscribed = false;

  function notify(rpsid: string) {
    for (const watcher of watchers.get(rpsid) ?? []) watcher.revoked();
  }

  async function check(watch: Watch) {
    try {
      if (!await getSession(clientId, watch.rpsid) && watchers.get(watch.rpsid)?.has(watch)) watch.revoked();
    } catch {
      // A storage outage is not a revocation. Resume reconciliation on reconnect.
    }
  }

  subscriber.on("message", (topic, rpsid) => { if (topic === channel) notify(rpsid); });
  subscriber.on("close", () => { subscribed = false; });
  subscriber.on("error", () => { /* Redis reconnects independently of live HTTP streams. */ });
  subscriber.on("ready", () => {
    void subscriber.subscribe(channel).then(() => {
      subscribed = true;
      for (const list of watchers.values()) for (const watcher of list) void check(watcher);
    }).catch(() => {
      // Retry on a fresh transport so there is no false subscribed state.
      if (subscriber.status === "ready") subscriber.disconnect(true);
    });
  });

  return function watch(watcher: Watch) {
    const list = watchers.get(watcher.rpsid) ?? new Set<Watch>();
    list.add(watcher);
    watchers.set(watcher.rpsid, list);
    if (subscriber.status === "wait") void subscriber.connect().catch(() => {});
    if (subscribed) void check(watcher);
    return () => {
      list.delete(watcher);
      if (!list.size) watchers.delete(watcher.rpsid);
    };
  };
}

export function watchSession(clientId: string, rpsid: string, revoked: () => void): () => void {
  let hub = hubs.get(clientId);
  if (!hub) {
    hub = createHub(clientId);
    hubs.set(clientId, hub);
  }
  return hub({ rpsid, revoked });
}

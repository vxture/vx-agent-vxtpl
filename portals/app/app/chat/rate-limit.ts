// Turn rate limit for the chat DEBUG surface (owner decision 2026-09-01):
// chat exists to verify the S2S chain, and every turn spends real Atlas
// tokens - so the frequency is capped per (workspace, sub), fixed window.
//
// In-memory on globalThis (the per-route-bundle singleton rule; see
// provisioning/lib/store.ts). vxtpl runs one container, so process-local is
// the honest scope; a horizontally scaled copy moves this into Redis.

export const CHAT_TURNS_PER_MINUTE = 6;
const WINDOW_MS = 60_000;

interface Bucket {
  windowStart: number;
  count: number;
}

interface RateGlobal {
  __vxtplChatRate?: Map<string, Bucket>;
}

function buckets(): Map<string, Bucket> {
  const g = globalThis as RateGlobal;
  g.__vxtplChatRate ??= new Map();
  return g.__vxtplChatRate;
}

export interface RateVerdict {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function allowChatTurn(key: string, now: number = Date.now()): RateVerdict {
  const map = buckets();
  const b = map.get(key);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    map.set(key, { windowStart: now, count: 1 });
    return { allowed: true };
  }
  if (b.count < CHAT_TURNS_PER_MINUTE) {
    b.count++;
    return { allowed: true };
  }
  return { allowed: false, retryAfterSeconds: Math.ceil((b.windowStart + WINDOW_MS - now) / 1000) };
}

/** Tests only: drop all buckets. */
export function resetChatRate(): void {
  buckets().clear();
}

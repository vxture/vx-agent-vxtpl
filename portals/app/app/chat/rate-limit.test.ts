import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CHAT_TURNS_PER_MINUTE, allowChatTurn, resetChatRate } from "./rate-limit";

beforeEach(() => resetChatRate());

test("allows up to the per-minute cap, then refuses with a retry hint", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < CHAT_TURNS_PER_MINUTE; i++) {
    assert.equal(allowChatTurn("ws:usr", t0 + i * 1000).allowed, true, `turn ${i + 1}`);
  }
  const refused = allowChatTurn("ws:usr", t0 + 10_000);
  assert.equal(refused.allowed, false);
  assert.ok((refused.retryAfterSeconds ?? 0) > 0 && (refused.retryAfterSeconds ?? 99) <= 60);
});

test("the window resets after a minute", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < CHAT_TURNS_PER_MINUTE; i++) allowChatTurn("ws:usr", t0);
  assert.equal(allowChatTurn("ws:usr", t0 + 1000).allowed, false);
  assert.equal(allowChatTurn("ws:usr", t0 + 60_000).allowed, true);
});

test("keys are independent", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < CHAT_TURNS_PER_MINUTE; i++) allowChatTurn("ws:a", t0);
  assert.equal(allowChatTurn("ws:a", t0 + 1).allowed, false);
  assert.equal(allowChatTurn("ws:b", t0 + 1).allowed, true);
});

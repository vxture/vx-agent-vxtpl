import { test } from "node:test";
import assert from "node:assert/strict";
import { validateHistory, MockChatResolver } from "./resolver";
import { MAX_HISTORY_MESSAGES, MAX_MESSAGE_LENGTH } from "./types";

test("validateHistory accepts well-formed messages", () => {
  const h = validateHistory([{ role: "user", content: "hi" }]);
  assert.equal(h.length, 1);
  assert.equal(h[0].content, "hi");
});

test("validateHistory rejects non-array input", () => {
  assert.throws(() => validateHistory("nope"));
  assert.throws(() => validateHistory(undefined));
});

test("validateHistory rejects an invalid role", () => {
  assert.throws(() => validateHistory([{ role: "system", content: "hi" }]));
});

test("validateHistory rejects empty/missing content", () => {
  assert.throws(() => validateHistory([{ role: "user", content: "" }]));
  assert.throws(() => validateHistory([{ role: "user" }]));
});

test("validateHistory rejects an over-length message", () => {
  assert.throws(() => validateHistory([{ role: "user", content: "x".repeat(MAX_MESSAGE_LENGTH + 1) }]));
});

test("validateHistory trims to the last MAX_HISTORY_MESSAGES entries", () => {
  const long = Array.from({ length: MAX_HISTORY_MESSAGES + 5 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `m${i}`,
  }));
  const h = validateHistory(long);
  assert.equal(h.length, MAX_HISTORY_MESSAGES);
  assert.equal(h[h.length - 1].content, `m${long.length - 1}`);
});

test("MockChatResolver echoes the last user message and reports mode=mock", async () => {
  const r = new MockChatResolver();
  const reply = await r.reply([{ role: "user", content: "ping" }]);
  assert.equal(reply.mode, "mock");
  assert.equal(reply.message.role, "assistant");
  assert.match(reply.message.content, /ping/);
});

test("MockChatResolver defaults to chat/default with no skill selected", async () => {
  const r = new MockChatResolver();
  const reply = await r.reply([{ role: "user", content: "hi" }]);
  assert.equal(reply.modelCode, "chat/default");
  assert.equal(reply.skillCode, null);
});

test("MockChatResolver echoes the selected model and skill", async () => {
  const r = new MockChatResolver();
  const reply = await r.reply([{ role: "user", content: "hi" }], {
    modelCode: "chat/reasoning",
    skillCode: "web-search",
  });
  assert.equal(reply.modelCode, "chat/reasoning");
  assert.equal(reply.skillCode, "web-search");
  assert.match(reply.message.content, /chat\/reasoning/);
  assert.match(reply.message.content, /web-search/);
});

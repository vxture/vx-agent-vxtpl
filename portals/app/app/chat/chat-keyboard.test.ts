/**
 * Covers keyboard submission, input history, and IME-sensitive navigation.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Test
 * @author AI-Generated
 * @date 2026-11-27
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { getChatInputHistoryDirection, isChatEscapeKey, isChatSendKey, stepChatInputHistory } from "./chat-keyboard";

type ChatKey = Parameters<typeof isChatSendKey>[0];

function key(value: string, options: Partial<ChatKey> = {}): ChatKey {
  return {
    key: value, defaultPrevented: false, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    nativeEvent: { keyCode: 0, isComposing: false }, ...options,
  };
}

test("Enter and the desktop send chords submit from the composer", () => {
  assert.equal(isChatSendKey(key("Enter")), true);
  assert.equal(isChatSendKey(key("Enter", { ctrlKey: true })), true);
  assert.equal(isChatSendKey(key("Enter", { metaKey: true })), true);
});

test("line breaks and keys handled by the browser or IME never submit", () => {
  assert.equal(isChatSendKey(key("Enter", { shiftKey: true })), false);
  assert.equal(isChatSendKey(key("Enter", { altKey: true })), false);
  assert.equal(isChatSendKey(key("Enter", { defaultPrevented: true })), false);
  assert.equal(isChatSendKey(key("Tab")), false);
  assert.equal(isChatSendKey(key("Enter", { nativeEvent: { keyCode: 13, isComposing: true } })), false);
  assert.equal(isChatSendKey(key("Enter", { nativeEvent: { keyCode: 229, isComposing: false } })), false);
});

test("only an unmodified Escape outside composition returns focus", () => {
  assert.equal(isChatEscapeKey(key("Escape")), true);
  assert.equal(isChatEscapeKey(key("Escape", { metaKey: true })), false);
  assert.equal(isChatEscapeKey(key("Escape", { defaultPrevented: true })), false);
  assert.equal(isChatEscapeKey(key("Escape", { nativeEvent: { keyCode: 229, isComposing: false } })), false);
});

test("only unmodified arrows outside IME navigate input history", () => {
  assert.equal(getChatInputHistoryDirection(key("ArrowUp")), "previous");
  assert.equal(getChatInputHistoryDirection(key("ArrowDown")), "next");
  assert.equal(getChatInputHistoryDirection(key("ArrowUp", { shiftKey: true })), undefined);
  assert.equal(getChatInputHistoryDirection(key("ArrowDown", { ctrlKey: true })), undefined);
  assert.equal(getChatInputHistoryDirection(key("ArrowUp", { defaultPrevented: true })), undefined);
  assert.equal(getChatInputHistoryDirection(key("ArrowUp", { nativeEvent: { keyCode: 229, isComposing: false } })), undefined);
});

function selection(value: string, start = value.length, end = start) {
  return { value, selectionStart: start, selectionEnd: end };
}

test("repeated arrows walk backward through prompts and return to the draft", () => {
  const zero = "First message";
  const one = "Second message\nwith two lines";
  const two = "Third message";
  let index = stepChatInputHistory("previous", selection("Unsent draft"), null, 3);
  assert.equal(index, 2);
  index = stepChatInputHistory("previous", selection(two), index ?? null, 3);
  assert.equal(index, 1);
  index = stepChatInputHistory("previous", selection(one), index ?? null, 3);
  assert.equal(index, 0);
  assert.equal(stepChatInputHistory("previous", selection(zero), index ?? null, 3), 0);
  index = stepChatInputHistory("next", selection(zero), index ?? null, 3);
  assert.equal(index, 1);
  index = stepChatInputHistory("next", selection(one), index ?? null, 3);
  assert.equal(index, 2);
  assert.equal(stepChatInputHistory("next", selection(two), index ?? null, 3), null);
});

test("a selection or vertical movement within multiple lines keeps native behavior", () => {
  const text = "First line\nSecond line";
  assert.equal(stepChatInputHistory("previous", selection(text, 13), null, 3), undefined);
  assert.equal(stepChatInputHistory("previous", selection(text, 5), null, 3), 2);
  assert.equal(stepChatInputHistory("previous", selection(text, 1, 3), null, 3), undefined);
  assert.equal(stepChatInputHistory("next", selection(text, 4), 1, 3), undefined);
  assert.equal(stepChatInputHistory("next", selection(text), null, 3), undefined);
  assert.equal(stepChatInputHistory("previous", selection(""), null, 0), undefined);
});

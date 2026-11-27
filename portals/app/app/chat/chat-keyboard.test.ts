/**
 * Covers keyboard submission and IME-sensitive focus navigation.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Test
 * @author AI-Generated
 * @date 2026-11-27
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { isChatEscapeKey, isChatSendKey } from "./chat-keyboard";

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

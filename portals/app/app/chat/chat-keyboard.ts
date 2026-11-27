/**
 * Shared keyboard rules for chat composers and focus return.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Interaction
 * @author AI-Generated
 * @date 2026-11-27
 */

import { useState, type KeyboardEvent } from "react";

type ChatKey = Pick<KeyboardEvent, "key" | "defaultPrevented" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey"> & {
  nativeEvent: Pick<KeyboardEvent["nativeEvent"], "isComposing" | "keyCode">;
};

function isComposing(event: ChatKey): boolean {
  // Safari may clear isComposing before the Enter that commits an IME selection.
  return event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
}

export function isChatSendKey(event: ChatKey): boolean {
  return !event.defaultPrevented && event.key === "Enter" && !event.shiftKey && !event.altKey && !isComposing(event);
}

export function isChatEscapeKey(event: ChatKey): boolean {
  return !event.defaultPrevented && event.key === "Escape" && !event.shiftKey &&
    !event.altKey && !event.ctrlKey && !event.metaKey && !isComposing(event);
}

export function handleChatComposerKey(event: KeyboardEvent<HTMLTextAreaElement>, canSend: boolean): void {
  if (!isChatSendKey(event)) return;
  event.preventDefault();
  if (canSend && !event.repeat) event.currentTarget.form?.requestSubmit();
}

// Input history

type ChatInputHistoryDirection = "previous" | "next";
type ChatInputSelection = Pick<HTMLTextAreaElement, "value" | "selectionStart" | "selectionEnd">;

export function getChatInputHistoryDirection(event: ChatKey): ChatInputHistoryDirection | undefined {
  if (event.defaultPrevented || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || isComposing(event)) return;
  if (event.key === "ArrowUp") return "previous";
  if (event.key === "ArrowDown") return "next";
}

export function stepChatInputHistory(
  direction: ChatInputHistoryDirection,
  input: ChatInputSelection,
  index: number | null,
  count: number,
): number | null | undefined {
  const { value, selectionStart, selectionEnd } = input;
  if (count === 0 || selectionStart !== selectionEnd) return;

  const atRecalledEnd = index !== null && selectionStart === value.length;
  if (direction === "previous") {
    if (!atRecalledEnd && value.slice(0, selectionStart).includes("\n")) return;
    return Math.max(0, (index ?? count) - 1);
  }

  if (index === null || value.slice(selectionEnd).includes("\n")) return;
  return index + 1 < count ? index + 1 : null;
}

export function useChatInputHistory(prompts: readonly string[], draft: string) {
  const [index, setIndex] = useState<number | null>(null);
  const value = index === null ? draft : prompts[index] ?? draft;

  function resetHistory() {
    setIndex(null);
  }

  function handleHistoryKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    const input = event.currentTarget;
    const direction = getChatInputHistoryDirection(event);
    if (!direction || input.readOnly || input.disabled) return false;
    const next = stepChatInputHistory(direction, input, index, prompts.length);
    if (next === undefined) return false;

    event.preventDefault();
    setIndex(next);
    const nextValue = next === null ? draft : prompts[next];
    if (nextValue === input.value) input.setSelectionRange(nextValue.length, nextValue.length);
    return true;
  }

  return { value, handleHistoryKey, resetHistory };
}

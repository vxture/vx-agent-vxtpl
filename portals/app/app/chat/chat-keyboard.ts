/**
 * Shared keyboard rules for chat composers and focus return.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Interaction
 * @author AI-Generated
 * @date 2026-11-27
 */

import type { KeyboardEvent } from "react";

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

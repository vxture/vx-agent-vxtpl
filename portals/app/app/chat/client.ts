/**
 * Shared transport for the full chat page and the assistant panel.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Client
 * @author AI-Generated
 * @date 2026-11-25
 */

import { CHAT_SCOPE_HEADER, type ChatMessage, type ChatOptions, type ChatReply } from "./types";
import type { GatedOption } from "./catalog";

export interface ChatContext {
  scopeKey: string;
  tier: string | null;
  productAccess: boolean;
  models: GatedOption[];
  skills: GatedOption[];
}

export class ChatRequestError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
  }
}

async function readResult<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as T & { code?: string; error?: string } | null;
  if (!response.ok || !body) {
    throw new ChatRequestError(response.status, body?.code, body?.error ?? `Unable to complete the request (HTTP ${response.status}).`);
  }
  return body;
}

export async function readChatContext(): Promise<ChatContext> {
  const response = await fetch("/api/chat", { cache: "no-store", signal: AbortSignal.timeout(8000) });
  const context = await readResult<ChatContext>(response);
  if (!context.scopeKey) throw new ChatRequestError(503, "SESSION_UNAVAILABLE", "Workspace verification is unavailable.");
  return context;
}

export async function requestChatTurn(history: ChatMessage[], scopeKey: string, options: ChatOptions): Promise<ChatReply> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", [CHAT_SCOPE_HEADER]: scopeKey },
    body: JSON.stringify({ history, ...options }),
  });
  return readResult<ChatReply>(response);
}

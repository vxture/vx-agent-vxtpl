/**
 * Shared transport for the full chat page and the assistant panel.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Client
 * @author AI-Generated
 * @date 2026-11-25
 */

import { CHAT_SCOPE_HEADER, type AtlasModelChoice, type ChatFailureEvidence, type ChatMessage, type ChatOptions, type ChatReply } from "./types";
import type { GatedOption } from "./catalog";

export interface ChatContext {
  scopeKey: string;
  tier: string | null;
  productAccess: boolean;
  models: GatedOption[];
  defaultModelCode?: string | null;
  atlasSource?: "live" | "mock";
  atlasRouteCatalogAvailable?: boolean;
  atlasDirectModels?: AtlasModelChoice[] | null;
  atlasDirectRequiredTier?: string | null;
  skills: GatedOption[];
}

export class ChatRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly callId?: string,
    readonly evidence?: ChatFailureEvidence,
  ) {
    super(message);
  }
}

async function readResult<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as T & {
    code?: string;
    error?: string;
    callId?: unknown;
    evidence?: ChatFailureEvidence;
  } | null;
  if (!response.ok || !body) {
    const message = response.status === 502 || response.status === 504
      ? "\u6682\u672a\u6536\u5230\u6a21\u578b\u56de\u590d\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002"
      : `Unable to complete the request (HTTP ${response.status}).`;
    const callId = typeof body?.callId === "string" ? body.callId : undefined;
    throw new ChatRequestError(response.status, body?.code, body?.error ?? message, callId, body?.evidence);
  }
  return body;
}

export async function readChatContext(): Promise<ChatContext> {
  const response = await fetch("/api/chat", { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const context = await readResult<ChatContext>(response);
  if (!context.scopeKey) throw new ChatRequestError(503, "SESSION_UNAVAILABLE", "Workspace verification is unavailable.");
  return context;
}

export async function requestChatTurn(history: ChatMessage[], scopeKey: string, options: ChatOptions): Promise<ChatReply> {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", [CHAT_SCOPE_HEADER]: scopeKey },
      body: JSON.stringify({ history, ...options }),
      signal: AbortSignal.timeout(options.skillCode ? 210_000 : 140_000),
    });
    const reply = await readResult<ChatReply>(response);
    if (reply.message?.role !== "assistant" || typeof reply.message.content !== "string" || !reply.message.content.trim()) {
      throw new ChatRequestError(502, "EMPTY_MODEL_REPLY", "\u6a21\u578b\u6ca1\u6709\u8fd4\u56de\u56de\u590d\uff0c\u8bf7\u91cd\u8bd5\u3002");
    }
    return reply;
  } catch (failure) {
    if (failure instanceof DOMException && failure.name === "TimeoutError") {
      throw new ChatRequestError(504, "CHAT_TIMEOUT", "\u7b49\u5f85\u56de\u590d\u8d85\u65f6\uff0c\u5df2\u4fdd\u7559\u4f60\u7684\u6d88\u606f\u3002");
    }
    throw failure;
  }
}

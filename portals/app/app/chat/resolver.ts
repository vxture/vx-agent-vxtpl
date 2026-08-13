import { getAtlasClientConfig, fetchChatCompletion, type AtlasClientConfig } from "./atlas-client";
import { MAX_HISTORY_MESSAGES, MAX_MESSAGE_LENGTH, type ChatMessage, type ChatReply } from "./types";

// Resolver abstraction (entitlement/resolver.ts precedent). The product code
// depends only on this interface; the factory picks the real Atlas client or
// the offline Mock.

export interface ChatResolver {
  reply(history: ChatMessage[]): Promise<ChatReply>;
}

export function validateHistory(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) throw new Error("history must be an array");
  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
  return trimmed.map((m) => {
    const o = m as Record<string, unknown>;
    if (o.role !== "user" && o.role !== "assistant") throw new Error("invalid role");
    if (typeof o.content !== "string" || o.content.length === 0) throw new Error("invalid content");
    if (o.content.length > MAX_MESSAGE_LENGTH) throw new Error("message too long");
    return { role: o.role, content: o.content };
  });
}

// Offline resolver: deterministic canned reply, no platform dependency. Lets
// the chat UI, route, and validation be verified without any Atlas
// credential.
export class MockChatResolver implements ChatResolver {
  async reply(history: ChatMessage[]): Promise<ChatReply> {
    const last = history[history.length - 1];
    const echo = last?.content ?? "";
    return {
      mode: "mock",
      message: {
        role: "assistant",
        content: `[mock] Atlas is not connected yet (see docs/80-liaison for the pending credential request). You said: ${echo}`,
      },
    };
  }
}

export class AtlasChatResolver implements ChatResolver {
  constructor(private readonly cfg: AtlasClientConfig) {}

  async reply(history: ChatMessage[]): Promise<ChatReply> {
    const message = await fetchChatCompletion(this.cfg, history);
    return { mode: "atlas", message };
  }
}

let singleton: ChatResolver | null = null;

export function getChatResolver(): ChatResolver {
  if (singleton) return singleton;
  const cfg = getAtlasClientConfig();
  singleton = cfg ? new AtlasChatResolver(cfg) : new MockChatResolver();
  return singleton;
}

// For tests: reset the memoized resolver.
export function resetChatResolver(): void {
  singleton = null;
}

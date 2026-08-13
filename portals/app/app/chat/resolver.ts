import { getAtlasClientConfig, fetchChatCompletion, DEFAULT_ENDPOINT_CODE, type AtlasClientConfig } from "./atlas-client";
import {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_LENGTH,
  type ChatMessage,
  type ChatOptions,
  type ChatReply,
} from "./types";

// Resolver abstraction (entitlement/resolver.ts precedent). The product code
// depends only on this interface; the factory picks the real Atlas client or
// the offline Mock. Model/skill selection (chat/catalog.ts) is validated and
// entitlement-gated by the caller (api/chat/route.ts) BEFORE reaching the
// resolver - the resolver trusts codes it receives.

export interface ChatResolver {
  reply(history: ChatMessage[], options?: ChatOptions): Promise<ChatReply>;
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
// credential. Echoes the selected model/skill back so the selection UI is
// verifiable even fully offline.
export class MockChatResolver implements ChatResolver {
  async reply(history: ChatMessage[], options: ChatOptions = {}): Promise<ChatReply> {
    const last = history[history.length - 1];
    const echo = last?.content ?? "";
    const modelCode = options.modelCode ?? DEFAULT_ENDPOINT_CODE;
    const skillNote = options.skillCode ? ` [skill: ${options.skillCode}]` : "";
    return {
      mode: "mock",
      modelCode,
      skillCode: options.skillCode ?? null,
      message: {
        role: "assistant",
        content:
          `[mock, model: ${modelCode}]${skillNote} Atlas is not connected yet ` +
          `(see docs/80-liaison for the pending credential request). You said: ${echo}`,
      },
    };
  }
}

export class AtlasChatResolver implements ChatResolver {
  constructor(private readonly cfg: AtlasClientConfig) {}

  async reply(history: ChatMessage[], options: ChatOptions = {}): Promise<ChatReply> {
    const modelCode = options.modelCode ?? DEFAULT_ENDPOINT_CODE;
    // Skill invocation requires the full Runos MCP protocol, out of scope
    // for now (see docs/80-liaison/70-...) - selection is recorded but not
    // yet wired into the Atlas call.
    const message = await fetchChatCompletion(this.cfg, history, modelCode);
    return { mode: "atlas", modelCode, skillCode: options.skillCode ?? null, message };
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

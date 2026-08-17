import { randomUUID } from "node:crypto";
import {
  getAtlasClientConfig,
  fetchChatCompletion,
  DEFAULT_ENDPOINT_CODE,
  type AtlasClientConfig,
} from "./atlas-client";
import { findSkill } from "./catalog";
import { runSkill } from "./skill-runner";
import { assertMockAllowed } from "../lib/deploy-stage";
import type { MintOptions } from "../lib/s2s-token";
import {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_LENGTH,
  type ChatMessage,
  type ChatOptions,
  type ChatReply,
  type SkillOutcome,
} from "./types";

// Resolver abstraction (entitlement/resolver.ts precedent). Product code depends
// only on this interface; the factory picks the real Atlas client or the offline
// Mock. Model and skill selection are validated and entitlement-gated by the
// caller (api/chat/route.ts) BEFORE reaching the resolver - the resolver trusts
// the codes it receives and does not re-check the gate.

/** Everything a turn needs about who is asking. Never optional on a real call. */
export interface ChatIdentity {
  workspaceId: string;
  /** Identity for S2S minting. OBO (subjectToken) is required for any Runos call. */
  mint: MintOptions;
  sessionId?: string;
}

export interface ChatResolver {
  reply(history: ChatMessage[], identity: ChatIdentity, options?: ChatOptions): Promise<ChatReply>;
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

// Offline resolver: deterministic canned reply, no platform dependency. Lets the
// chat UI, route, and validation be verified with no credential at all. It is
// refused on a deployed stage - see lib/deploy-stage.ts for why.
export class MockChatResolver implements ChatResolver {
  async reply(history: ChatMessage[], _identity: ChatIdentity, options: ChatOptions = {}): Promise<ChatReply> {
    const last = history[history.length - 1];
    const echo = last?.content ?? "";
    const modelCode = options.modelCode ?? DEFAULT_ENDPOINT_CODE;
    const skillNote = options.skillCode ? ` [skill: ${options.skillCode}]` : "";
    return {
      mode: "mock",
      modelCode,
      skillCode: options.skillCode ?? null,
      skill: options.skillCode
        ? { code: options.skillCode, capabilityId: null, status: "not-invoked", detail: "offline mock: Runos is not called" }
        : undefined,
      message: {
        role: "assistant",
        content: `[mock, model: ${modelCode}]${skillNote} Atlas is not configured. You said: ${echo}`,
      },
    };
  }
}

export class AtlasChatResolver implements ChatResolver {
  constructor(private readonly cfg: AtlasClientConfig) {}

  async reply(history: ChatMessage[], identity: ChatIdentity, options: ChatOptions = {}): Promise<ChatReply> {
    const modelCode = options.modelCode ?? DEFAULT_ENDPOINT_CODE;
    // ONE task id spans the whole turn - the Runos skill invocation, the outcome
    // report that closes it, and the Atlas inference call. Both planes require
    // it and both store it verbatim, so a turn that spent a capability call and
    // model tokens can be totalled back up as one unit of work. Two ids would
    // make that impossible, and neither side would complain.
    const taskId = `vxtpl-${randomUUID()}`;

    let skill: SkillOutcome | undefined;
    let messages = history;

    if (options.skillCode) {
      skill = await runSkill(options.skillCode, history, {
        taskId,
        identity: identity.mint,
        sessionId: identity.sessionId,
      });
      // A skill that produced something feeds the model; one that did not is
      // reported honestly rather than silently dropped, so the user can tell
      // "the skill found nothing" from "the skill never ran".
      if (skill.status === "ran" && skill.detail) {
        messages = [
          ...history.slice(0, -1),
          {
            role: "user",
            content:
              `${history[history.length - 1].content}\n\n` +
              `[${findSkill(options.skillCode)?.label ?? options.skillCode} result]\n${skill.detail}`,
          },
        ];
      }
    }

    const completion = await fetchChatCompletion(this.cfg, identity.mint, messages, {
      taskId,
      endpointCode: modelCode,
    });

    return {
      mode: "atlas",
      // Report the model that actually served, not the one requested.
      modelCode: completion.modelCode || modelCode,
      skillCode: options.skillCode ?? null,
      skill,
      message: completion.message,
      usage: completion.usage ?? undefined,
      latencyMs: completion.latencyMs,
      finishReason: completion.finishReason,
    };
  }
}

let singleton: ChatResolver | null = null;

export function getChatResolver(): ChatResolver {
  if (singleton) return singleton;
  const cfg = getAtlasClientConfig();
  if (cfg) {
    singleton = new AtlasChatResolver(cfg);
    return singleton;
  }
  assertMockAllowed("chat (Atlas)", "ATLAS_API_URL");
  singleton = new MockChatResolver();
  return singleton;
}

/** For tests: reset the memoized resolver. */
export function resetChatResolver(): void {
  singleton = null;
}

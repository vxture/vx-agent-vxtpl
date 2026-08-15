// Chat module. Calls Atlas (the L1 model supply plane) for the reply and,
// when a skill is selected, Runos (the L1 capability plane) to actually run
// that skill - both on S2S tokens minted per call from vxtpl's own OIDC client.
// An offline Mock stands in for local dev and CI so the UI and route are
// verifiable with no credentials; it is refused on a deployed stage
// (lib/deploy-stage.ts).

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  modelCode?: string;
  skillCode?: string;
}

/** What a skill invocation actually did, surfaced so the UI can show it. */
export interface SkillOutcome {
  code: string;
  /** The Runos capability that ran, once resolved from the skill's search terms. */
  capabilityId: string | null;
  status: "ran" | "unavailable" | "failed" | "not-invoked";
  detail: string;
  callId?: string;
}

export interface ChatReply {
  message: ChatMessage;
  mode: "atlas" | "mock";
  /** The model that SERVED the turn - endpoint fallback can differ from the request. */
  modelCode: string;
  skillCode: string | null;
  skill?: SkillOutcome;
  /**
   * Absent when the upstream reported no usage. Atlas returns zeros in that case
   * while recording nothing, so a zero here would be a claim about consumption
   * rather than the absence of one.
   */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs?: number;
  finishReason?: string;
}

export const MAX_HISTORY_MESSAGES = 20;
export const MAX_MESSAGE_LENGTH = 4000;

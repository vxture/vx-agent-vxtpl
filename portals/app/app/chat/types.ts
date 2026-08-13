// Chat capability-verification module. Calls the platform's Atlas model
// gateway (L1 model supply, separate from the C1/C2/C3 login/entitlement/
// provisioning channels) when credentials are configured; otherwise falls
// back to a deterministic offline Mock so the UI and route are verifiable
// without platform coordination. See
// docs/80-liaison/60-2608130300-vxtpl-atlas-chat-request.md for the
// outstanding scope + credential request.

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatReply {
  message: ChatMessage;
  mode: "atlas" | "mock";
}

export const MAX_HISTORY_MESSAGES = 20;
export const MAX_MESSAGE_LENGTH = 4000;

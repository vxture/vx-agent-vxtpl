import { assertInternalTarget } from "../lib/internal-target";
import type { ChatMessage } from "./types";

// Atlas S2S caller (L1 model supply, agent-facing data plane). Contract
// verified against the Atlas interface reference (main@3b5ba2f, 2026-08-13),
// section 04 "data plane" (POST /v1/chat) and section 03 "routing". This
// client is dormant until ATLAS_API_URL + ATLAS_S2S_TOKEN are both
// configured - see docs/80-liaison/60-2608130300-vxtpl-atlas-chat-request.md
// for the pending scope decision + credential request.
//
// Auth: S2sAuthGuard - RS256 JWT, aud=atlas, scope=tool:atlas, standard
// bearer auth. NOT the x-vxture-internal-auth header C2 uses (that's a
// separate, older convention specific to the platform entitlement endpoint) -
// ATLAS_S2S_TOKEN is expected to already be an issued bearer token, not a
// shared secret this client exchanges itself.

export interface AtlasClientConfig {
  baseUrl: string;
  authToken: string;
  tenantId: string;
}

export function getAtlasClientConfig(): AtlasClientConfig | null {
  const baseUrl = process.env.ATLAS_API_URL;
  const authToken = process.env.ATLAS_S2S_TOKEN;
  if (!baseUrl || !authToken) return null; // -> Mock resolver
  return { baseUrl, authToken, tenantId: process.env.OIDC_CLIENT_ID ?? "__PRODUCT_CODE__" };
}

function authHeaders(cfg: AtlasClientConfig): HeadersInit {
  return { authorization: `Bearer ${cfg.authToken}`, accept: "application/json" };
}

// ModelRuntimeException envelope (covers /v1/* · /tenancy/*).
export interface AtlasErrorEnvelope {
  code: string;
  message: string;
  requestId?: string;
  modelCode?: string;
  provider?: string;
  retryAfterMs?: number;
  resetAt?: string;
}

export class AtlasError extends Error {
  constructor(
    public readonly status: number,
    public readonly envelope: AtlasErrorEnvelope,
  ) {
    super(`atlas ${envelope.code}: ${envelope.message}`);
  }
}

async function throwAtlasError(res: Response): Promise<never> {
  let envelope: AtlasErrorEnvelope;
  try {
    envelope = (await res.json()) as AtlasErrorEnvelope;
  } catch {
    envelope = { code: "UNKNOWN", message: `HTTP ${res.status}` };
  }
  throw new AtlasError(res.status, envelope);
}

// "chat/default" is the interface reference's own example of a global stable
// endpointCode (routing section: modelCode > endpointCode > taskProfile
// priority). We have no per-model grant and no per-tenant taskProfile, so we
// route by endpointCode - the same choice /v1/embed · /v1/rerank would make.
const DEFAULT_ENDPOINT_CODE = "chat/default";

interface ChatCompletionResponse {
  id: string;
  modelCode: string;
  message: { role: "assistant"; content: string };
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
  finishReason?: string;
}

export async function fetchChatCompletion(cfg: AtlasClientConfig, messages: ChatMessage[]): Promise<ChatMessage> {
  const url = assertInternalTarget(`${cfg.baseUrl.replace(/\/$/, "")}/v1/chat`);
  const res = await fetch(url, {
    method: "POST",
    headers: { ...authHeaders(cfg), "content-type": "application/json" },
    body: JSON.stringify({ endpointCode: DEFAULT_ENDPOINT_CODE, messages, tenantId: cfg.tenantId }),
    cache: "no-store",
  });
  if (!res.ok) await throwAtlasError(res);
  const raw = (await res.json()) as ChatCompletionResponse;
  return { role: "assistant", content: raw.message?.content ?? "" };
}

interface AtlasModel {
  modelCode: string;
  modelName: string;
  provider: string;
  protocol: string;
  capabilities: string[];
}

/** Lightweight connectivity + auth probe (GET /v1/models) - spends no model tokens. */
export async function verifyAtlasConnectivity(cfg: AtlasClientConfig): Promise<{ modelCount: number }> {
  const url = assertInternalTarget(`${cfg.baseUrl.replace(/\/$/, "")}/v1/models`);
  const res = await fetch(url, { headers: authHeaders(cfg), cache: "no-store" });
  if (!res.ok) await throwAtlasError(res);
  const raw = (await res.json()) as AtlasModel[];
  return { modelCount: Array.isArray(raw) ? raw.length : 0 };
}

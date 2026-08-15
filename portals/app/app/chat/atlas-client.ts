import { randomUUID } from "node:crypto";
import { assertInternalTarget } from "../lib/internal-target";
import { invalidateS2SToken, mintS2S, type MintOptions, type S2SToken } from "../lib/s2s-token";
import type { ChatMessage } from "./types";

// Atlas client - the model supply plane (L1). Contract verified against the
// Atlas interface reference, section 04 "data plane" (POST /v1/chat) and
// section 03 "routing" (modelCode > endpointCode > taskProfile precedence).
//
// Auth: S2sAuthGuard - RS256 bearer, aud=atlas, scope=tool:atlas. The token is
// minted per call (lib/s2s-token.ts), not configured: platform S2S tokens live
// 300 seconds and cannot be refreshed, so there is no such thing as a
// long-lived ATLAS_S2S_TOKEN to put in an env file.
//
// The request body's `tenantId` is the platform TENANT UUID, taken from the
// minted token's `tenant_id` claim. That is worth stating because the obvious
// alternative - sending the product code - appears to work: Atlas validates only
// that the field is a non-empty string, and the product-grant path returns
// before the tenant path is reached. The moment a grant is missing or an
// endpoint is repointed, control falls through to a UUID assertion and the call
// fails with 400 INVALID_TENANT_ID, which reads like a payload bug and hides the
// real cause. A non-UUID also silently writes NULL into Atlas's request log, so
// vxtpl's traffic disappears from every tenant rollup with no error at all.

export const ATLAS_AUDIENCE = "atlas";

export interface AtlasClientConfig {
  baseUrl: string;
}

export function getAtlasClientConfig(): AtlasClientConfig | null {
  const baseUrl = process.env.ATLAS_API_URL;
  if (!baseUrl) return null; // -> Mock resolver (refused on a deployed stage)
  return { baseUrl };
}

// ModelRuntimeException envelope (covers /v1/* and /tenancy/*).
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

  /** Transient conditions worth one retry; a routing or auth error is not one. */
  get retryable(): boolean {
    if (this.status === 429) return true;
    return this.status >= 500 && this.status < 600;
  }
}

/**
 * Atlas answers in three different error shapes, and a client that reads `code`
 * unconditionally reports `undefined` for the whole validation class - which is
 * exactly the class a new integration hits first:
 *
 *   {code, message, ...}          ModelRuntimeException (the documented one)
 *   {statusCode, message, error}  Nest request validation - no `code` at all
 *   {code, message}               the S2S guard
 */
async function throwAtlasError(res: Response): Promise<never> {
  let envelope: AtlasErrorEnvelope;
  try {
    const body = (await res.json()) as Partial<AtlasErrorEnvelope> & {
      statusCode?: number;
      error?: string;
      message?: unknown;
    };
    const message = Array.isArray(body.message) ? body.message.join("; ") : String(body.message ?? "");
    envelope = {
      ...body,
      code: body.code ?? (body.error ? `VALIDATION_${body.error.toUpperCase().replace(/\s+/g, "_")}` : "UNKNOWN"),
      message: message || `HTTP ${res.status}`,
    };
  } catch {
    envelope = { code: "UNKNOWN", message: `HTTP ${res.status}` };
  }
  throw new AtlasError(res.status, envelope);
}

// "chat/default" is the reference's own example of a global stable endpointCode.
// vxtpl holds no per-model grant and no per-tenant taskProfile, so it routes by
// endpointCode - the same choice /v1/embed and /v1/rerank would make.
export const DEFAULT_ENDPOINT_CODE = "chat/default";

// Atlas's own upstream time-to-first-byte timeout is 30s, and it may try an
// endpoint's fallback model after the primary times out - so one call can
// legitimately exceed 60s. This is the ceiling that lets Atlas finish rather
// than converting its structured failure into an opaque client abort.
const CALL_TIMEOUT_MS = 90_000;
const PROBE_TIMEOUT_MS = 10_000;

interface ChatCompletionResponse {
  id: string;
  modelCode: string;
  message: { role: "assistant"; content: string };
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
  finishReason?: string;
}

/** What Atlas actually did, as opposed to what was asked for. */
export interface AtlasCompletion {
  message: ChatMessage;
  /** The model that served the turn - endpoint fallback makes this differ from the request. */
  modelCode: string;
  /**
   * Null when the upstream reported no usage. Atlas returns zeros in that case
   * while recording NULL internally, and summing those zeros as real token
   * counts would understate consumption without anything looking wrong.
   */
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  latencyMs: number;
  finishReason?: string;
  requestId: string;
}

async function atlasFetch(
  cfg: AtlasClientConfig,
  identity: MintOptions,
  path: string,
  build: (minted: S2SToken) => RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const url = assertInternalTarget(`${cfg.baseUrl.replace(/\/$/, "")}${path}`);
  const send = async (): Promise<Response> => {
    const minted = await mintS2S(ATLAS_AUDIENCE, identity);
    const init = build(minted);
    return fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), authorization: `Bearer ${minted.token}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  };

  const res = await send();
  // A 401 on a token we believed was valid means the cached one is stale (or was
  // revoked). Drop it and try once with a fresh mint before surfacing the error.
  if (res.status !== 401) return res;
  invalidateS2SToken(ATLAS_AUDIENCE, identity);
  return send();
}

export async function fetchChatCompletion(
  cfg: AtlasClientConfig,
  identity: MintOptions,
  messages: ChatMessage[],
  endpointCode: string = DEFAULT_ENDPOINT_CODE,
): Promise<AtlasCompletion> {
  // Also Atlas's C3 idempotency key, and the only way to correlate this call in
  // its request log - so it is generated here rather than left to the server.
  const requestId = randomUUID();

  const res = await atlasFetch(
    cfg,
    identity,
    "/v1/chat",
    (minted) => {
      // Atlas takes the tenant from the token when it is there and falls back to
      // the body otherwise; the body is never allowed to override a verified
      // claim. Sending the claim back means the two always agree. When the token
      // carries neither, the field is OMITTED rather than sent empty: an empty
      // string trips a "must be a non-empty string" validation error that reads
      // like a client bug, where omitting it produces Atlas's real "no tenant
      // anywhere" 400.
      const tenantId = minted.claims.tenant_id ?? minted.claims.org_id ?? null;
      if (!minted.claims.workspace_id) {
        // Not fatal, and Atlas will not complain - which is the problem. Without
        // this claim the quota check is skipped entirely and the usage row lands
        // on a NULL workspace, so the call falls out of the tenant x workspace
        // rollup that billing is computed from.
        console.warn(
          "[atlas] minted token carries no workspace_id: quota will be skipped and usage recorded against no workspace",
        );
      }
      return {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpointCode,
          messages,
          ...(tenantId ? { tenantId } : {}),
          requestId,
        }),
      };
    },
    CALL_TIMEOUT_MS,
  );
  if (!res.ok) await throwAtlasError(res);
  const raw = (await res.json()) as ChatCompletionResponse;
  const reported = raw.usage && raw.usage.totalTokens > 0 ? raw.usage : null;
  return {
    message: { role: "assistant", content: raw.message?.content ?? "" },
    modelCode: raw.modelCode,
    usage: reported,
    latencyMs: raw.latencyMs,
    finishReason: raw.finishReason,
    requestId: raw.id ?? requestId,
  };
}

export interface AtlasModel {
  modelCode: string;
  modelName: string;
  provider: string;
  protocol: string;
  capabilities: string[];
}

/**
 * The global model catalog. NOT grant-filtered, so this is an auth and
 * connectivity probe rather than a model picker - it lists every model Atlas
 * knows about, not the ones vxtpl may route to. There is deliberately no way to
 * discover our own endpoint codes at runtime: `/capability/endpoints` is
 * operator-only and rejects a `tool:atlas` token, so the catalog in catalog.ts
 * is kept in sync by liaison, not by introspection.
 */
export async function listAtlasModels(cfg: AtlasClientConfig, identity: MintOptions): Promise<AtlasModel[]> {
  const res = await atlasFetch(cfg, identity, "/v1/models", () => ({ method: "GET" }), PROBE_TIMEOUT_MS);
  if (!res.ok) await throwAtlasError(res);
  const raw = (await res.json()) as AtlasModel[];
  return Array.isArray(raw) ? raw : [];
}

/** Connectivity + auth probe. Spends no model tokens. */
export async function verifyAtlasConnectivity(
  cfg: AtlasClientConfig,
  identity: MintOptions,
): Promise<{ modelCount: number }> {
  return { modelCount: (await listAtlasModels(cfg, identity)).length };
}

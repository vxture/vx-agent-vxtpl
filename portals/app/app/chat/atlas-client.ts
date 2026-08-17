import { randomUUID } from "node:crypto";
import { assertInternalTarget } from "../lib/internal-target";
import { invalidateS2SToken, mintS2S, type MintOptions, type S2SToken } from "../lib/s2s-token";
import { isRetryable, type PlatformErrorBody } from "../lib/platform-error";
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

/**
 * An Atlas `/v1` error as this client holds it.
 *
 * On the wire `retryable` is mandatory (product_251 X-1, and Atlas types it
 * non-optional). It is optional HERE because this type also describes the
 * envelope we synthesize when a response is not parseable at all - a proxy page,
 * a truncated body - where inventing a retry answer would be worse than
 * admitting we do not have one. `AtlasError.retryable` resolves that case from
 * the code table below.
 */
export interface AtlasErrorEnvelope extends Omit<PlatformErrorBody, "retryable"> {
  retryable?: boolean;
  requestId?: string;
  modelCode?: string;
  provider?: string;
  resetAt?: string;
}

/**
 * Codes whose retry answer we hold locally, for the window before every Atlas
 * error carries `retryable` of its own.
 *
 * A status range cannot express this. `MODEL_NOT_IMPLEMENTED` is a 501 and must
 * NEVER be retried - the upstream simply does not have the capability, so
 * retrying re-pays the timeout forever. `QUOTA_EXCEEDED` can arrive as a 429 and
 * must not be retried either: a commercial ceiling only an operator can raise
 * looks exactly like a capacity gate that clears on its own, and only the code
 * tells them apart.
 */
const ATLAS_RETRYABLE: Record<string, boolean> = {
  RATE_LIMITED: true,
  PROVIDER_UNAVAILABLE: true,
  MODEL_RUNTIME_STREAM_FAILED: true,
  UPSTREAM_FRAME_UNPARSEABLE: true,
  MODEL_NOT_IMPLEMENTED: false,
  MODEL_NOT_ROUTABLE: false,
  ENDPOINT_NOT_ROUTABLE: false,
  TASK_PROFILE_NOT_ROUTABLE: false,
  NOT_ENTITLED: false,
  QUOTA_EXCEEDED: false,
  INVALID_TENANT_ID: false,
  INVALID_APPLICATION_ID: false,
  CANDIDATE_POOL_TOO_LARGE: false,
};

export class AtlasError extends Error {
  constructor(
    public readonly status: number,
    public readonly envelope: AtlasErrorEnvelope,
  ) {
    super(`atlas ${envelope.code}: ${envelope.message}`);
  }

  /**
   * Whether backing off could help. Precedence: the callee's own answer, then
   * our table, then the status. A 401 is absent from all three on purpose -
   * re-minting and calling again is standard token handling, and a different
   * thing from the back-off this describes.
   */
  get retryable(): boolean {
    if (typeof this.envelope.retryable === "boolean") return this.envelope.retryable;
    const known = ATLAS_RETRYABLE[this.envelope.code];
    if (typeof known === "boolean") return known;
    return isRetryable(undefined, this.status);
  }

  /** How long the callee asked us to wait, when it said. */
  get retryAfterMs(): number | undefined {
    return this.envelope.retryAfterMs;
  }
}

/**
 * One envelope on `/v1` now: `code` on every error, guard and runtime alike.
 * Atlas used to answer request-validation failures with a bare Nest body
 * (`{statusCode, message, error}` and no `code` at all), which was the shape a
 * new integration met first and the one that made a client report `undefined`.
 * That is gone; the `?? "UNKNOWN"` below is a defensive floor for a non-JSON
 * body, not a second shape we expect.
 */
async function throwAtlasError(res: Response): Promise<never> {
  let envelope: AtlasErrorEnvelope;
  try {
    const body = (await res.json()) as Partial<AtlasErrorEnvelope> & { message?: unknown };
    const message = Array.isArray(body.message) ? body.message.join("; ") : String(body.message ?? "");
    envelope = { ...body, code: body.code ?? "UNKNOWN", message: message || `HTTP ${res.status}` };
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

export interface ChatCallOptions {
  /**
   * The agent task this call belongs to. REQUIRED by Atlas since v0.15.0
   * (`400 TASK_ID_REQUIRED` without it), and deliberately the SAME value vxtpl
   * sends to Runos for the same turn: Atlas is the only inference-metering
   * entry point, so a task that spans a capability call and a model call can
   * only be totalled back up if both carry one id. `requestId` does not
   * substitute - that identifies one call, not the work it belongs to.
   */
  taskId: string;
  endpointCode?: string;
}

export async function fetchChatCompletion(
  cfg: AtlasClientConfig,
  identity: MintOptions,
  messages: ChatMessage[],
  opts: ChatCallOptions,
): Promise<AtlasCompletion> {
  const endpointCode = opts.endpointCode ?? DEFAULT_ENDPOINT_CODE;
  // Also Atlas's C3 idempotency key, and the only way to correlate this call in
  // its request log - so it is generated here rather than left to the server.
  const requestId = randomUUID();

  const res = await atlasFetch(
    cfg,
    identity,
    "/v1/chat",
    (minted) => {
      // The tenant comes from the token, never from anything vxtpl declares -
      // Atlas UUID-asserts it up front now, so a product code here is a plain
      // `400 INVALID_TENANT_ID` rather than the delayed, misleading failure it
      // used to be. Omitted when the token carries neither, which Atlas answers
      // with `TENANT_ID_REQUIRED`: a missing tenant is a real condition and its
      // own error is clearer than an empty string we invented.
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
          taskId: opts.taskId,
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
  /**
   * `inactive` wins over `deprecated`; `active` means live and not scheduled for
   * removal. This pair is the ONLY advance warning a consumer gets that a model
   * is going away - without reading it, the notification is a 404 at call time.
   */
  state: "active" | "deprecated" | "inactive";
  deprecatedAt: string | null;
}

/**
 * The global model catalog. NOT grant-filtered - it lists every model Atlas
 * knows about, not the ones vxtpl may route to - so it is an auth and
 * connectivity probe, not a model picker. For "what may I actually call", use
 * `listGrantedEndpoints` below.
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

/**
 * What this caller may actually route to.
 *
 * The calling product comes from the token's `act.sub`; there is deliberately no
 * `productCode` parameter, since letting a caller name a product would let it
 * enumerate a sibling's grants. Atlas answers this with the same resolution the
 * call path uses, so the catalog cannot drift from what a call would be
 * authorized under - a catalog that drifts is worse than none, because it gets
 * believed.
 */
export interface GrantedEndpoint {
  endpointCode: string;
  /** Null only when `state` is "missing" - there is no row to read it from. */
  category: string | null;
  /**
   * - `active`   granted, and the entry point routes
   * - `inactive` granted, but an operator deactivated or withdrew the endpoint
   * - `missing`  granted, but no such endpoint exists - a dangling grant,
   *              usually an operator typo
   *
   * The last two are listed rather than filtered out. A call gets the same 404
   * for either, but only one of them is ours to fix; omitting them would read as
   * "you were never granted this".
   */
  state: "active" | "inactive" | "missing";
}

export async function listGrantedEndpoints(
  cfg: AtlasClientConfig,
  identity: MintOptions,
): Promise<GrantedEndpoint[]> {
  const res = await atlasFetch(cfg, identity, "/v1/endpoints", () => ({ method: "GET" }), PROBE_TIMEOUT_MS);
  if (!res.ok) await throwAtlasError(res);
  const raw = (await res.json()) as { endpoints?: GrantedEndpoint[] };
  return raw.endpoints ?? [];
}

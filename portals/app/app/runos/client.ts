import { assertInternalTarget } from "../lib/internal-target";
import { mintS2SToken, type MintOptions } from "../lib/s2s-token";

// Runos client - the commercial capability plane (L1). vxtpl uses it two ways:
// a read-only well-known probe on /platform-check, and a real
// discover -> resolve -> invoke -> report_outcome loop behind a chat skill.
//
// Transport (verified against runos service/src/gateway/mcp.controller.ts, not
// only its docs): MCP streamable HTTP at POST /v1/mcp, configured stateless
// (no Mcp-Session-Id is issued or accepted) with enableJsonResponse, so a bare
// tools/call returns a single JSON object with no initialize handshake. That is
// why this is a hand-written fetch client and not the MCP SDK: the SDK's only
// added value here is the standalone GET SSE stream, which runos does not route.
//
// Auth: S2S bearer, aud=runos, scope=tool:runos, compared by EXACT string
// equality - a space-delimited scope is rejected. Tokens live 300 seconds and
// are minted per use (see lib/s2s-token.ts), never configured.
//
// Production Runos (v0.5.0) requires a `sub` claim, which only OBO-mode tokens
// carry, so every call must ride a real user session. Runos ADR-013 relaxes
// that - `sub` becomes OBO-only and service-mode audit falls back to `act.sub` -
// but it is merged-unreleased and ships with v0.6.0. Until then a service-mode
// token answers 401 S2S_TOKEN_MISSING_SUB. `identity` therefore takes the full
// MintOptions shape (which will work unchanged after v0.6.0) while callers pass
// the OBO form today.

export const RUNOS_AUDIENCE = "runos";

export interface RunosClientConfig {
  baseUrl: string;
}

export function getRunosClientConfig(): RunosClientConfig | null {
  const baseUrl = process.env.RUNOS_API_URL;
  if (!baseUrl) return null;
  return { baseUrl };
}

export class RunosError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`runos ${status}: ${message}`);
  }
}

/**
 * A capability that refused to run. This is NOT an HTTP failure: runos answers
 * 200 with result.isError and puts the envelope in structuredContent, because
 * the JSON-RPC call itself succeeded - only the capability behind it did not.
 */
export interface RunosFailure {
  error_class:
    | "caller_error"
    | "capability_error"
    | "capability_timeout"
    | "gateway_timeout"
    | "gateway_error"
    | "authz_rejected"
    | "cancelled";
  error_code?: string; // omitted for the two timeout classes
  retryable: boolean;
  call_id?: string; // only once the call resolved to an operation
}

/** Per-call metadata the gateway attaches to a successful invoke. */
export interface RunosCallMeta {
  call_id?: string;
  version_resolved?: string;
  /**
   * "distributed" means Runos handed back a Skill's CONTENT rather than a
   * result: Runos distributes skills, it never executes them (ADR-006), so the
   * caller runs it in its own runtime. An absent field means "executed".
   */
  result_kind?: "executed" | "distributed";
  content_digest?: string;
}

export type RunosResult<T> =
  | { ok: true; data: T; meta?: RunosCallMeta; text?: string; callId?: string }
  | { ok: false; failure: RunosFailure };

// The server's own invoke ceiling is 60s. Time out above it, or a
// capability_timeout envelope turns into an opaque client abort.
const INVOKE_TIMEOUT_MS = 75_000;
const PROBE_TIMEOUT_MS = 10_000;

let rpcId = 0;

export interface CallToolOptions {
  taskId: string;
  /** How to mint the S2S token. Runos needs the OBO shape (subjectToken). */
  identity: MintOptions;
  /**
   * Attach `delegation_token` so the capability runs as the end user.
   *
   * The token sent is the MINTED one, not the user's own access token. Runos
   * verifies the delegation token with `audience = "runos"` and then re-asserts
   * `payload.aud === audience`, while a user access token from this app is
   * minted with `aud = <our client id>` - the OBO exchange itself requires that.
   * So forwarding the raw session token would fail every invoke with
   * `caller_error/invalid_delegation`, and it would read as a capability fault
   * rather than as our bug. The OBO-minted token is the one that satisfies the
   * check: it carries `aud=runos`, the user's `sub`, and a `jti`.
   */
  delegate?: boolean;
  sessionId?: string;
  timeoutMs?: number;
}

async function callTool<T>(
  cfg: RunosClientConfig,
  name: string,
  args: Record<string, unknown>,
  opts: CallToolOptions,
): Promise<RunosResult<T>> {
  const url = assertInternalTarget(`${cfg.baseUrl.replace(/\/$/, "")}/v1/mcp`);
  const token = await mintS2SToken(RUNOS_AUDIENCE, opts.identity);

  const vxture: Record<string, unknown> = {
    task_id: opts.taskId,
    agent_version: process.env.APP_VERSION ?? "unknown",
  };
  // Only meaningful on an OBO mint - a service-mode token carries no user to
  // delegate. Sending it in that case would assert a user identity we do not have.
  if (opts.delegate && opts.identity.subjectToken) vxture.delegation_token = token;
  if (opts.sessionId) vxture.session_id = opts.sessionId;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      // Both media types are mandatory - the transport does a substring check
      // on each and answers 406 if either is missing.
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++rpcId,
      method: "tools/call",
      // _meta is a sibling of name/arguments. Nesting it inside arguments makes
      // params._meta undefined and every tool answers caller_error/missing_metadata.
      params: { name, arguments: args, _meta: { vxture } },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(opts.timeoutMs ?? INVOKE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new RunosError(res.status, body || res.statusText);
  }

  const rpc = (await res.json()) as {
    error?: { code: number; message: string };
    result?: { isError?: boolean; structuredContent?: unknown; content?: { type: string; text: string }[] };
  };
  if (rpc.error) throw new RunosError(200, `jsonrpc ${rpc.error.code}: ${rpc.error.message}`);

  const result = rpc.result ?? {};
  if (result.isError) return { ok: false, failure: result.structuredContent as RunosFailure };

  const structured = result.structuredContent as
    | (T & { _meta_vxture?: RunosCallMeta; _meta?: { vxture?: RunosCallMeta } })
    | undefined;
  // The gateway emits a FLAT `_meta_vxture` key inside structuredContent while
  // the published contract documents a nested `_meta.vxture`. Read both: the
  // flat form is what production answers with today, and the nested form is
  // where the contract says it is heading.
  const meta = structured?._meta_vxture ?? structured?._meta?.vxture;
  const text = result.content?.find((c) => c.type === "text")?.text;
  return { ok: true, data: structured as T, meta, text, callId: meta?.call_id };
}

// --- Tool wrappers ----------------------------------------------------------
// Note the casing split, which is the server's and not ours to normalize:
// discover flattens to snake_case, resolve passes the stored contract through
// verbatim in camelCase.

export interface RunosCapability {
  capability_id: string;
  title: string;
  display_name?: Record<string, string>;
  primitive_type: "connector" | "executor" | "skill";
  category?: string;
  tags?: string[];
  summary?: string;
  use_when?: string;
  avoid_when?: string;
  operations: {
    operation: string;
    description?: string;
    interaction_mode?: string;
    risk_level?: "read" | "write" | "critical";
  }[];
}

export interface RunosContract {
  capability_id: string;
  title: string;
  primitive_type: string;
  provider: string;
  version: string;
  state: string;
  contract: {
    operations: {
      operation: string;
      description?: string;
      inputSchema?: unknown;
      outputSchema?: unknown;
      interactionMode?: string;
      riskLevel?: string;
      idempotent?: boolean;
    }[];
  };
}

/** Search the entitled catalog. An empty list is a valid answer, not an error. */
export function runosDiscover(
  cfg: RunosClientConfig,
  query: string,
  opts: CallToolOptions & { limit?: number; category?: string; tags?: string[] },
): Promise<RunosResult<{ capabilities: RunosCapability[] }>> {
  const args: Record<string, unknown> = { query, limit: opts.limit ?? 25 };
  if (opts.category) args.category = opts.category;
  if (opts.tags?.length) args.tags = opts.tags;
  return callTool(cfg, "runos_discover", args, { ...opts, timeoutMs: opts.timeoutMs ?? PROBE_TIMEOUT_MS });
}

/** Fetch a capability's operation contract. Safe to cache per capability@version. */
export function runosResolve(
  cfg: RunosClientConfig,
  capabilityId: string,
  opts: CallToolOptions & { version?: string },
): Promise<RunosResult<RunosContract>> {
  return callTool(
    cfg,
    "runos_resolve",
    { capability_id: capabilityId, version: opts.version ?? "stable" },
    { ...opts, timeoutMs: opts.timeoutMs ?? PROBE_TIMEOUT_MS },
  );
}

/**
 * Run one operation. Every call is billed and audited, including retries - so a
 * retry is only correct when the failure says retryable AND the operation's own
 * contract says idempotent. The gateway never retries on your behalf.
 */
export function runosInvoke(
  cfg: RunosClientConfig,
  capabilityId: string,
  operation: string,
  args: Record<string, unknown>,
  opts: CallToolOptions & { version?: string },
): Promise<RunosResult<Record<string, unknown>>> {
  return callTool(
    cfg,
    "runos_invoke",
    { capability_id: capabilityId, operation, arguments: args, version: opts.version ?? "stable" },
    opts,
  );
}

/** Close the task out. Fire-and-forget: a failed report must not fail the turn. */
export function runosReportOutcome(
  cfg: RunosClientConfig,
  outcome: "success" | "failure" | "partial",
  opts: CallToolOptions & { capabilitiesUsed?: string[]; note?: string },
): Promise<RunosResult<{ acknowledged: boolean }>> {
  const args: Record<string, unknown> = { task_id: opts.taskId, outcome };
  if (opts.capabilitiesUsed?.length) args.capabilities_used = opts.capabilitiesUsed;
  if (opts.note) args.note = opts.note.slice(0, 500);
  return callTool(cfg, "runos_report_outcome", args, { ...opts, timeoutMs: opts.timeoutMs ?? PROBE_TIMEOUT_MS });
}

// --- Connectivity probe -----------------------------------------------------

interface ToolsWellKnown {
  service: string;
  transport: { kind: string; path: string };
  tools: { name: string; description: string }[];
}

/**
 * Agent-facing discovery probe (GET /.well-known/vxture-tools) - proves S2S auth
 * works and lists the fixed MCP tool set. The response carries no protocol
 * version field; the protocol version is a request header we send, not
 * something the service advertises here.
 */
export async function verifyRunosConnectivity(
  cfg: RunosClientConfig,
  identity: MintOptions,
): Promise<{ transport: string; path: string; tools: string[] }> {
  const url = assertInternalTarget(`${cfg.baseUrl.replace(/\/$/, "")}/.well-known/vxture-tools`);
  const token = await mintS2SToken(RUNOS_AUDIENCE, identity);
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new RunosError(res.status, body || res.statusText);
  }
  const raw = (await res.json()) as ToolsWellKnown;
  return {
    transport: raw.transport?.kind ?? "unknown",
    path: raw.transport?.path ?? "unknown",
    tools: (raw.tools ?? []).map((t) => t.name),
  };
}

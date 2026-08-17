import { createHash } from "node:crypto";
import { assertInternalTarget } from "./internal-target";

// S2S token minting - RFC 8693 token exchange against the platform IdP.
//
// This replaces the ATLAS_S2S_TOKEN / RUNOS_S2S_TOKEN environment variables the
// repo used to carry, and it is not a refactor for tidiness: platform S2S tokens
// live 300 seconds and are explicitly NOT refreshable (product_210 D1), so a
// token pasted into .env is expired five minutes after it is issued. A static
// token can pass one manual smoke test and nothing else.
//
// The caller's credential is its own confidential OIDC client - the same
// client_id/client_secret pair vxtpl already holds for the C1 login flow. There
// is no separate S2S credential to procure.
//
// Two modes, and the choice is not cosmetic:
//
//   OBO     `subject_token` = a user access_token this IdP issued. Workspace and
//           subject are read FROM that token, so the caller cannot claim a
//           workspace it has no session in. The minted token carries `sub`.
//   service no subject_token; the caller declares `workspace_id`. Minting is
//           gated on vxtpl actually covering that workspace (an active/trialing
//           subscription, or a provisioned state) - the D2 gate, which answers
//           400 invalid_target when the coverage is absent. Service-mode tokens
//           carry NO `sub` by design.
//
// Every callee accepts both modes. Which one to mint is therefore a question
// about the CALL, not about the callee: work a person initiated should be OBO,
// so the workspace is derived from their verified token and the callee has a
// real end user to attribute to; work nobody initiated has no subject to speak
// for and uses service mode.

export const PLATFORM_AUDIENCE = "vxture";

const TOKEN_PATH = "/oidc/token";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:token-exchange";
/** Re-mint this early, so a token never expires mid-flight on a slow call. */
const EXPIRY_MARGIN_MS = 30_000;
const MINT_TIMEOUT_MS = 10_000;

export interface S2SConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
}

export function getS2SConfig(): S2SConfig | null {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) return null;
  return { issuer, clientId, clientSecret };
}

export class S2STokenError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(`s2s token exchange ${status} ${code}: ${message}`);
  }

  /** Only a missing signing key, rate limiting, and upstream faults are worth retrying. */
  get retryable(): boolean {
    if (this.code === "temporarily_unavailable") return true;
    return this.status === 429 || (this.status >= 500 && this.status < 600);
  }
}

/**
 * Pull the OAuth error code out of the token endpoint's response.
 *
 * The endpoint answers with a NestJS HttpException body, not the RFC 6749 shape:
 * `{"message":"invalid_target","error":"Bad Request","statusCode":400}`. The
 * OAuth code is in `message`; `error` holds the HTTP reason phrase, so a client
 * that reads `error` learns only "Bad Request".
 */
function errorCodeFrom(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message) return parsed.message;
  } catch {
    /* not JSON - fall through */
  }
  return "exchange_failed";
}

export interface MintOptions {
  /** OBO mode: the end user's access token. Required for any call to Runos. */
  subjectToken?: string;
  /** service mode: the workspace vxtpl is speaking for. Ignored when subjectToken is set. */
  workspaceId?: string;
  orgId?: string;
}

/**
 * The claims the platform stamps on a minted token. Callees authorize on these,
 * and `tenant_id` in particular is the only trustworthy source of the tenant
 * identity a request should be attributed to - it is resolved server-side from
 * the workspace, so it cannot be spoofed by the caller and does not have to be
 * carried in vxtpl's own configuration.
 */
export interface S2SClaims {
  aud: string;
  /** The calling product code - "vxtpl". */
  act?: { sub?: string };
  mode?: "obo" | "service";
  scope?: string;
  /** Present in OBO mode only; service-mode tokens omit it entirely. */
  sub?: string;
  workspace_id?: string | null;
  org_id?: string | null;
  /** Null when the workspace row is missing or soft-deleted. */
  tenant_id?: string | null;
  exp?: number;
}

export interface S2SToken {
  token: string;
  claims: S2SClaims;
}

interface CachedToken {
  token: string;
  claims: S2SClaims;
  expiresAtMs: number;
}

/**
 * Read a JWT's payload WITHOUT verifying it.
 *
 * That is safe here and only here: this token was just minted by the issuer over
 * an authenticated TLS channel, and we are reading it to decide what to put in
 * our own outbound request - not to make an authorization decision. The callee
 * verifies the signature, which is where that check belongs.
 */
function decodeClaims(jwt: string): S2SClaims {
  const payload = jwt.split(".")[1];
  if (!payload) return {} as S2SClaims;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as S2SClaims;
  } catch {
    return {} as S2SClaims;
  }
}

// Cache key must include the mode and its context: an OBO token for user A must
// never be handed to a request from user B, and a service token for workspace X
// is not valid for workspace Y. OBO entries are keyed by a hash of the subject
// token so the token itself is not used as a map key.
const cache = new Map<string, CachedToken>();

function cacheKey(audience: string, opts: MintOptions): string {
  if (opts.subjectToken) return `obo:${audience}:${fingerprint(opts.subjectToken)}`;
  return `svc:${audience}:${opts.orgId ?? "-"}:${opts.workspaceId ?? "-"}`;
}

/**
 * Key material for an OBO cache entry, so the user's access token is not itself
 * used as a map key.
 *
 * SHA-256 rather than a cheap non-cryptographic hash: a collision here would
 * serve one user's minted token to another user's request, and a 32-bit hash
 * makes that merely unlikely rather than impossible. This is not a hot path -
 * it runs once per token mint, at most every 270 seconds per user.
 */
function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

/**
 * Mint (or reuse) an S2S bearer token for `audience` - a target product code
 * such as "atlas" or "runos", or PLATFORM_AUDIENCE for the platform's own
 * /platform/* and /usage/* endpoints.
 */
export async function mintS2SToken(audience: string, opts: MintOptions = {}): Promise<string> {
  return (await mintS2S(audience, opts)).token;
}

/** As `mintS2SToken`, but also returns the minted claims (for `tenant_id`). */
export async function mintS2S(audience: string, opts: MintOptions = {}): Promise<S2SToken> {
  const cfg = getS2SConfig();
  if (!cfg) {
    throw new S2STokenError(
      0,
      "not_configured",
      "OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET must all be set to mint an S2S token",
    );
  }
  if (!opts.subjectToken && !opts.workspaceId) {
    throw new S2STokenError(
      0,
      "invalid_request",
      `minting for audience '${audience}' needs either a subjectToken (OBO) or a workspaceId (service mode)`,
    );
  }

  const key = cacheKey(audience, opts);
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAtMs - EXPIRY_MARGIN_MS) return { token: hit.token, claims: hit.claims };

  const form = new URLSearchParams({
    grant_type: GRANT_TYPE,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    audience,
  });
  if (opts.subjectToken) {
    form.set("subject_token", opts.subjectToken);
  } else {
    form.set("workspace_id", opts.workspaceId as string);
    if (opts.orgId) form.set("org_id", opts.orgId);
  }

  const url = assertInternalTarget(`${cfg.issuer.replace(/\/$/, "")}${TOKEN_PATH}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(MINT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // `invalid_target` is overloaded: the audience check runs first, the D2
    // coverage check second. With a known-good audience string it therefore
    // means coverage - the platform has not opened vxtpl in that workspace yet,
    // which is the failure a newly registered product hits first.
    throw new S2STokenError(res.status, errorCodeFrom(body), body.slice(0, 300) || res.statusText);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new S2STokenError(res.status, "malformed_response", "token endpoint returned no access_token");
  }
  const ttlMs = (json.expires_in ?? 300) * 1000;
  const claims = decodeClaims(json.access_token);
  evictExpired();
  cache.set(key, { token: json.access_token, claims, expiresAtMs: Date.now() + ttlMs });
  return { token: json.access_token, claims };
}

/**
 * Drop entries that can no longer be served.
 *
 * Without this the Map only ever grows: an OBO key embeds a digest of the
 * subject token, and that token rotates on every silent refresh, so a single
 * long-lived session mints a fresh key every few minutes and never reuses the
 * old one. In a container that stays up for weeks, that is an unbounded leak of
 * dead credentials. Sweeping on mint keeps it proportional to live sessions
 * without needing a timer.
 */
function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now >= entry.expiresAtMs) cache.delete(key);
  }
}

/** Drop a cached token after a 401, so the next attempt re-mints rather than replaying. */
export function invalidateS2SToken(audience: string, opts: MintOptions = {}): void {
  cache.delete(cacheKey(audience, opts));
}

/** For tests. */
export function resetS2STokenCache(): void {
  cache.clear();
}

/** For tests: assert on key SHAPE without exposing any cached token value. */
export function cacheKeysForTest(): string[] {
  return [...cache.keys()];
}

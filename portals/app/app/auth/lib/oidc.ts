import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type KeyLike,
  type JWTVerifyGetKey,
} from "jose";
import type { OidcConfig } from "./config";

// Token verification and code/refresh exchange (080-rp section 2.5). All checks
// are mandatory: RS256 only (reject none/HS* downgrade), iss, aud, exp with 60s
// skew. JWKS is fetched by kid and cached (createRemoteJWKSet refreshes on an
// unknown kid). id_token additionally requires a matching nonce (checked by the
// caller, since it is per-request state).

const CLOCK_TOLERANCE_SECONDS = 60;

let jwksCache: {
  url: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
} | null = null;

function getJwks(cfg: OidcConfig) {
  if (!jwksCache || jwksCache.url !== cfg.jwksUrl) {
    jwksCache = { url: cfg.jwksUrl, jwks: createRemoteJWKSet(new URL(cfg.jwksUrl)) };
  }
  return jwksCache.jwks;
}

// A verification key: raw key material (tests inject a local public key) or the
// remote JWKS resolver function.
export type KeyResolver = KeyLike | Uint8Array | JWTVerifyGetKey;

export async function verifyToken(
  token: string,
  cfg: OidcConfig,
  opts: { audience?: string; keyResolver?: KeyResolver } = {},
): Promise<JWTPayload> {
  const key: KeyResolver = opts.keyResolver ?? getJwks(cfg);
  const options = {
    issuer: cfg.issuer,
    audience: opts.audience ?? cfg.clientId,
    algorithms: ["RS256"], // hard allowlist: `none` / HS* are rejected here
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
  };
  // jwtVerify is overloaded on key-material vs getKey-function; branch so each
  // call site matches one overload.
  const { payload } =
    typeof key === "function"
      ? await jwtVerify(token, key, options)
      : await jwtVerify(token, key, options);
  return payload;
}

export interface TokenSet {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}

function basicAuth(cfg: OidcConfig): string {
  return "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
}

export async function exchangeCode(
  cfg: OidcConfig,
  code: string,
  codeVerifier: string,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: codeVerifier,
  });
  return postToken(cfg, body);
}

export async function refreshTokens(cfg: OidcConfig, refreshToken: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return postToken(cfg, body);
}

const USERINFO_TIMEOUT_MS = 2000;

/**
 * UserInfo (OIDC core 5.3) with the caller's own access token. DISPLAY ONLY -
 * never authorization: authorization reads verified access-token claims, and a
 * bearer-authenticated JSON body is not that.
 *
 * Returns null on any failure (non-200, timeout, unparseable, sub mismatch)
 * because a missing name must degrade to a fallback label, never to a broken
 * identity strip. The sub check is the one hard rule here: a response whose sub
 * is not the caller's is another person's profile, so it is dropped rather than
 * rendered.
 */
export async function fetchUserInfo(
  cfg: OidcConfig,
  accessToken: string,
  expectedSub: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(cfg.userInfoUrl, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(USERINFO_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    if (typeof body?.sub !== "string" || body.sub !== expectedSub) return null;
    return body;
  } catch {
    return null;
  }
}

async function postToken(cfg: OidcConfig, body: URLSearchParams): Promise<TokenSet> {
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: basicAuth(cfg),
      accept: "application/json",
    },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`token endpoint ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TokenSet;
}

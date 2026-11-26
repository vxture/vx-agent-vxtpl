import { getOidcConfig } from "../lib/config";
import { verifyToken } from "../lib/oidc";
import { errors } from "jose";
import { revokeSessionsForSid } from "../lib/session-store";

// POST /auth/backchannel-logout (080-rp section 2.7): IdP -> RP server call (no
// browser cookie). Verify logout_token (RS256/iss/aud/exp), require the
// backchannel-logout event, sid and jti, and forbid nonce. Revoking the same
// IdP sid again is idempotent. Acknowledge after Redis confirms revocation.
export const dynamic = "force-dynamic";

const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";

export async function POST(req: Request): Promise<Response> {
  const cfg = getOidcConfig();
  if (!cfg.enabled) return new Response(null, { status: 503 });
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") {
    return new Response(null, { status: 415 });
  }
  const form = await req.formData().catch(() => null);
  const logoutToken = form?.get("logout_token");
  if (typeof logoutToken !== "string" || logoutToken.length > 8192 || form?.getAll("logout_token").length !== 1) {
    return new Response("bad request", { status: 400 });
  }

  let claims;
  try {
    claims = await verifyToken(logoutToken, cfg);
  } catch (error) {
    const temporary = !(error instanceof errors.JOSEError) || error.code === "ERR_JWKS_TIMEOUT" || error.code === "ERR_JOSE_GENERIC";
    return new Response(null, { status: temporary ? 503 : 400 });
  }

  const now = Math.floor(Date.now() / 1000);
  const events = claims.events;
  const event = events && typeof events === "object" && !Array.isArray(events)
    ? (events as Record<string, unknown>)[BACKCHANNEL_EVENT]
    : null;
  if (
    claims.aud !== cfg.clientId || claims.nonce !== undefined ||
    !event || typeof event !== "object" || Array.isArray(event) ||
    typeof claims.iat !== "number" || claims.iat > now + 60 ||
    typeof claims.exp !== "number" || claims.exp <= claims.iat || claims.exp - claims.iat > 300 ||
    typeof claims.jti !== "string" || !claims.jti ||
    typeof claims.sid !== "string" || !claims.sid || claims.sid.length > 512
  ) {
    return new Response("invalid logout claims", { status: 400 });
  }
  try {
    await revokeSessionsForSid(cfg.clientId, claims.sid);
  } catch {
    return new Response(null, { status: 503 });
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOidcConfig } from "../../auth/lib/config";
import { getAuthContext } from "../../auth/lib/session";
import { getAtlasClientConfig, verifyAtlasConnectivity } from "../../chat/atlas-client";
import { getRunosClientConfig, verifyRunosConnectivity } from "../../runos/client";
import { getS2SConfig, type MintOptions } from "../../lib/s2s-token";

// GET /api/platform-check - consumer-perspective verification of the two L1
// platforms vxtpl consumes: Atlas (model supply, GET /v1/models) and Runos
// (capability plane, GET /.well-known/vxture-tools). Both probes are read-only
// and spend no tokens or quota.
//
// Both need an S2S token, and a token needs an identity. The probe therefore
// runs on the caller's own session when there is one (OBO), which is also the
// only shape Runos accepts - a service-mode token carries no `sub` and its guard
// rejects it. Without a session the probe reports what is missing rather than
// failing: "not signed in" is a legitimate state for this page.
export const dynamic = "force-dynamic";

interface ProbeResult {
  configured: boolean;
  ok: boolean;
  detail: string;
}

const NOT_CONFIGURED = (what: string): ProbeResult => ({ configured: false, ok: false, detail: `${what} not set` });

async function checkAtlas(identity: MintOptions | null): Promise<ProbeResult> {
  const cfg = getAtlasClientConfig();
  if (!cfg) return NOT_CONFIGURED("ATLAS_API_URL");
  if (!identity) return { configured: true, ok: false, detail: "sign in to probe Atlas (the S2S token is minted on your session)" };
  try {
    const { modelCount } = await verifyAtlasConnectivity(cfg, identity);
    return { configured: true, ok: true, detail: `GET /v1/models -> ${modelCount} routable model(s)` };
  } catch (err) {
    return { configured: true, ok: false, detail: err instanceof Error ? err.message : "verification failed" };
  }
}

async function checkRunos(identity: MintOptions | null): Promise<ProbeResult> {
  const cfg = getRunosClientConfig();
  if (!cfg) return NOT_CONFIGURED("RUNOS_API_URL");
  if (!identity) return { configured: true, ok: false, detail: "sign in to probe Runos (its S2S guard requires a user subject)" };
  try {
    const { transport, path, tools } = await verifyRunosConnectivity(cfg, identity);
    return {
      configured: true,
      ok: true,
      detail: `GET /.well-known/vxture-tools -> ${transport} at ${path}, tools: ${tools.join(", ")}`,
    };
  } catch (err) {
    return { configured: true, ok: false, detail: err instanceof Error ? err.message : "verification failed" };
  }
}

export async function GET(): Promise<Response> {
  const s2s = getS2SConfig();
  let identity: MintOptions | null = null;
  if (s2s) {
    const cfg = getOidcConfig();
    const jar = await cookies();
    const rpsid = jar.get(cfg.cookieName)?.value;
    const ctx = rpsid ? await getAuthContext(cfg, rpsid).catch(() => null) : null;
    if (ctx) identity = { subjectToken: ctx.accessToken };
  }

  const tokenMint: ProbeResult = s2s
    ? {
        configured: true,
        ok: identity != null,
        detail: identity
          ? "on-behalf-of, minted per call from this session"
          : "configured, but no signed-in session to mint against",
      }
    : NOT_CONFIGURED("OIDC_ISSUER / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET");

  const [atlas, runos] = await Promise.all([checkAtlas(identity), checkRunos(identity)]);
  return NextResponse.json({ tokenMint, atlas, runos });
}

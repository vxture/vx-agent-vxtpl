import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOidcConfig } from "../../auth/lib/config";
import { getAuthContext } from "../../auth/lib/session";
import { getAtlasClientConfig, listGrantedEndpoints, verifyAtlasConnectivity } from "../../chat/atlas-client";
import { MODEL_CATALOG } from "../../chat/catalog";
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
    return { configured: true, ok: true, detail: `GET /v1/models -> ${modelCount} model(s) in the global catalog` };
  } catch (err) {
    return { configured: true, ok: false, detail: err instanceof Error ? err.message : "verification failed" };
  }
}

/**
 * Reconcile the shipped model catalog against what vxtpl is actually granted.
 *
 * This is the check that could not exist before `GET /v1/endpoints`: every entry
 * in `MODEL_CATALOG` is an `endpointCode` whose only previous failure signal was
 * a 404 in front of a user. Now a mismatch is named here - and the two
 * directions mean different things, so they are reported separately rather than
 * summed into one "N problems".
 */
async function checkCatalog(identity: MintOptions | null): Promise<ProbeResult> {
  const cfg = getAtlasClientConfig();
  if (!cfg) return NOT_CONFIGURED("ATLAS_API_URL");
  if (!identity) return { configured: true, ok: false, detail: "sign in to reconcile the catalog" };
  try {
    const granted = await listGrantedEndpoints(cfg, identity);
    const byCode = new Map(granted.map((g) => [g.endpointCode, g]));
    const shipped = MODEL_CATALOG.map((m) => m.code);

    // Shipped but not callable: a user picking this model gets a 404.
    const broken = shipped
      .map((code) => ({ code, state: byCode.get(code)?.state ?? "not-granted" }))
      .filter((e) => e.state !== "active");
    // Granted but not offered: not an error, just capability we are not using.
    const unused = granted.filter((g) => g.state === "active" && !shipped.includes(g.endpointCode));

    const parts: string[] = [];
    if (broken.length) parts.push(`WOULD 404: ${broken.map((b) => `${b.code} (${b.state})`).join(", ")}`);
    if (unused.length) parts.push(`granted but unused: ${unused.map((u) => u.endpointCode).join(", ")}`);
    if (!parts.length) parts.push(`all ${shipped.length} catalog entries are granted and active`);

    return { configured: true, ok: broken.length === 0, detail: parts.join("; ") };
  } catch (err) {
    return { configured: true, ok: false, detail: err instanceof Error ? err.message : "reconciliation failed" };
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

  const [atlas, catalog, runos] = await Promise.all([
    checkAtlas(identity),
    checkCatalog(identity),
    checkRunos(identity),
  ]);
  return NextResponse.json({ tokenMint, atlas, catalog, runos });
}

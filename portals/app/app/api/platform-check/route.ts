import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOidcConfig } from "../../auth/lib/config";
import { getAuthContext } from "../../auth/lib/session";
import { getAtlasClientConfig, listGrantedEndpoints, verifyAtlasConnectivity } from "../../chat/atlas-client";
import { MODEL_CATALOG } from "../../chat/catalog";
import { getRunosClientConfig, verifyRunosConnectivity } from "../../runos/client";
import { getS2SConfig, type MintOptions } from "../../lib/s2s-token";
import { assertInternalTarget } from "../../lib/internal-target";
import { getPlatformClientConfig, parseEntitlementEnvelope } from "../../entitlement/platform-client";
import { makePlatformConsume } from "../../usage/lib/flush";
import { getUsageStore } from "../../usage/lib/store";
import { verifySignature, webhookSecrets } from "../../provisioning/lib/verify";
import { getProvisioningStore } from "../../provisioning/lib/store";

// GET /api/platform-check - consumer-perspective verification of every
// platform channel vxtpl consumes, per the integration general rules'
// go-live checklist: C1 (OIDC discovery + JWKS), C2 (live entitlement
// resolve, envelope + cache header), C3 up (consume target + buffer state),
// C3 down (verifier self-test + recorded deliveries), plus the two L1
// planes (Atlas, Runos). Every GET probe is read-only and spends nothing.
//
// POST { probe: "c3-replay" } is the ONE spending probe - the checklist's
// idempotency check (same key sent twice; the second answer must say
// replayed:true and carry the FIRST event's id). It consumes at most one
// unit of vxtpl.chat.messages per workspace per day (the key is
// date-stable), and only on an explicit click - never on page load.
export const dynamic = "force-dynamic";

interface ProbeResult {
  configured: boolean;
  ok: boolean;
  detail: string;
}

const NOT_CONFIGURED = (what: string): ProbeResult => ({ configured: false, ok: false, detail: `${what} not set` });

async function checkC1(): Promise<ProbeResult> {
  const cfg = getOidcConfig();
  if (!cfg.enabled) {
    return { configured: false, ok: false, detail: "OIDC_RP_ENABLED is off (local dev state)" };
  }
  try {
    const discoRes = await fetch(`${cfg.issuer}/.well-known/openid-configuration`, { cache: "no-store" });
    if (!discoRes.ok) return { configured: true, ok: false, detail: `discovery ${discoRes.status}` };
    const disco = (await discoRes.json()) as { issuer?: string };
    const issuerOk = disco.issuer === cfg.issuer;

    const jwksRes = await fetch(cfg.jwksUrl, { cache: "no-store" });
    if (!jwksRes.ok) return { configured: true, ok: false, detail: `jwks ${jwksRes.status}` };
    const jwks = (await jwksRes.json()) as { keys?: unknown[] };
    const keyCount = Array.isArray(jwks.keys) ? jwks.keys.length : 0;

    return {
      configured: true,
      ok: issuerOk && keyCount > 0,
      detail:
        `discovery ok, issuer ${issuerOk ? "matches" : `MISMATCH (${disco.issuer})`}; ` +
        `jwks ${keyCount} key(s); client ${cfg.clientId}, scopes "${cfg.scopes}"`,
    };
  } catch (err) {
    return { configured: true, ok: false, detail: err instanceof Error ? err.message : "C1 probe failed" };
  }
}

/** Direct fetch (not the cached resolver) so the probe also reports the
 * Cache-Control the platform actually sends - the 45s the client honors. */
async function checkC2(workspaceId: string | null): Promise<ProbeResult> {
  const cfg = getPlatformClientConfig();
  if (!cfg) return NOT_CONFIGURED("PLATFORM_API_URL + PLATFORM_INTERNAL_AUTH_TOKEN");
  if (!workspaceId) {
    return { configured: true, ok: false, detail: "sign in to resolve your workspace's entitlement" };
  }
  try {
    const url = assertInternalTarget(
      `${cfg.baseUrl.replace(/\/$/, "")}/platform/entitlements` +
        `?workspace_id=${encodeURIComponent(workspaceId)}&product=${encodeURIComponent(cfg.product)}`,
    );
    const res = await fetch(url, {
      headers: { "x-vxture-internal-auth": cfg.authToken, accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return { configured: true, ok: false, detail: `entitlement endpoint ${res.status}` };
    const cacheControl = res.headers.get("cache-control") ?? "(no cache-control header)";
    const env = parseEntitlementEnvelope(workspaceId, cfg.product, await res.json());
    return {
      configured: true,
      ok: true,
      detail:
        `status=${env.status ?? "null (never subscribed)"}, tier=${env.tier ?? "null"}, ` +
        `bundled=${env.bundled}, ${Object.keys(env.limits).length} limit(s), ` +
        `${env.quota_pools.length} pool(s); Cache-Control: ${cacheControl}`,
    };
  } catch (err) {
    return { configured: true, ok: false, detail: err instanceof Error ? err.message : "C2 probe failed" };
  }
}

async function checkC3Up(): Promise<ProbeResult> {
  const cfg = getPlatformClientConfig();
  if (!cfg) return NOT_CONFIGURED("PLATFORM_API_URL + PLATFORM_INTERNAL_AUTH_TOKEN");
  try {
    const pending = (await getUsageStore().unflushed(50)).length;
    return {
      configured: true,
      ok: true,
      detail:
        `consume target configured (always-200 contract, x-request-id attached); ` +
        `${pending} buffered row(s) awaiting flush; the replay probe below runs the live idempotency check`,
    };
  } catch (err) {
    return { configured: true, ok: false, detail: err instanceof Error ? err.message : "C3-up probe failed" };
  }
}

async function checkC3Down(): Promise<ProbeResult> {
  const secrets = webhookSecrets();
  if (secrets.length === 0) return NOT_CONFIGURED("PROVISION_WEBHOOK_SECRET");
  // Self-test: sign a synthetic payload exactly as the platform does
  // (t=,v1= over "{t}.{rawBody}") and run it through the real verifier -
  // proves parse, tolerance and timing-safe compare without touching the
  // store or waiting for a live delivery.
  const t = Math.floor(Date.now() / 1000);
  const raw = JSON.stringify({ probe: true });
  const v1 = createHmac("sha256", secrets[0]).update(`${t}.${raw}`).digest("hex");
  const selfTest = verifySignature(raw, `t=${t},v1=${v1}`, secrets);
  const tampered = verifySignature(`${raw} `, `t=${t},v1=${v1}`, secrets); // must fail
  try {
    const recent = await getProvisioningStore().recentDeliveries(5);
    const seen =
      recent.length === 0
        ? "no deliveries recorded yet"
        : `last deliveries: ${recent.map((d) => `${d.type} (${d.result})`).join(", ")}`;
    return {
      configured: true,
      ok: selfTest && !tampered,
      detail:
        `verifier self-test ${selfTest ? "passed" : "FAILED"}, ` +
        `tamper rejection ${tampered ? "FAILED" : "passed"}; ${seen}` +
        `${secrets.length > 1 ? "; rotation secret loaded" : ""}`,
    };
  } catch (err) {
    return { configured: true, ok: false, detail: err instanceof Error ? err.message : "C3-down probe failed" };
  }
}

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

interface Session {
  workspaceId: string;
  sub: string;
  accessToken: string;
}

async function resolveSession(): Promise<Session | null> {
  const cfg = getOidcConfig();
  if (!cfg.enabled) return null;
  const jar = await cookies();
  const rpsid = jar.get(cfg.cookieName)?.value;
  const ctx = rpsid ? await getAuthContext(cfg, rpsid).catch(() => null) : null;
  if (!ctx?.user.activeWorkspace) return null;
  return { workspaceId: ctx.user.activeWorkspace, sub: ctx.user.sub, accessToken: ctx.accessToken };
}

export async function GET(): Promise<Response> {
  const session = await resolveSession();
  const s2s = getS2SConfig();
  const identity: MintOptions | null = s2s && session ? { subjectToken: session.accessToken } : null;

  const tokenMint: ProbeResult = s2s
    ? {
        configured: true,
        ok: identity != null,
        detail: identity
          ? "on-behalf-of, minted per call from this session"
          : "configured, but no signed-in session to mint against",
      }
    : NOT_CONFIGURED("OIDC_ISSUER / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET");

  const [c1, c2, c3Up, c3Down, atlas, catalog, runos] = await Promise.all([
    checkC1(),
    checkC2(session?.workspaceId ?? null),
    checkC3Up(),
    checkC3Down(),
    checkAtlas(identity),
    checkCatalog(identity),
    checkRunos(identity),
  ]);
  return NextResponse.json({ c1, c2, c3Up, c3Down, tokenMint, atlas, catalog, runos });
}

/** The C3 replay probe (checklist #5): same idempotency key twice; the second
 * response must say replayed:true and return the FIRST event's id. */
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { probe?: string };
  if (body.probe !== "c3-replay") {
    return NextResponse.json({ error: "unknown probe" }, { status: 400 });
  }
  const cfg = getPlatformClientConfig();
  if (!cfg) {
    return NextResponse.json({ error: "platform (C2/C3) is not configured on this stack" }, { status: 503 });
  }
  const session = await resolveSession();
  if (!session) {
    return NextResponse.json({ error: "sign in - the probe consumes against your workspace" }, { status: 403 });
  }

  // Date-stable key: repeat clicks on the same day replay instead of spending.
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const row = {
    workspaceId: session.workspaceId,
    metric: "vxtpl.chat.messages",
    amount: 1,
    idempotencyKey: `probe-replay-${session.workspaceId}-${day}`,
    endUserId: session.sub,
    flushed: false,
  };

  const consume = makePlatformConsume(cfg);
  try {
    const first = await consume(row);
    const second = await consume(row);
    const ok =
      first.status === 200 &&
      second.status === 200 &&
      second.body?.replayed === true &&
      Boolean(first.body?.event_id) &&
      first.body?.event_id === second.body?.event_id;
    return NextResponse.json({
      ok,
      detail: ok
        ? `replay verified: event ${second.body?.event_id} returned twice, second marked replayed`
        : "replay NOT verified - see the two raw results",
      first: { status: first.status, ...first.body },
      second: { status: second.status, ...second.body },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, detail: err instanceof Error ? err.message : "consume unreachable" },
      { status: 502 },
    );
  }
}

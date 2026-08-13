import { NextResponse } from "next/server";
import { getAtlasClientConfig, verifyAtlasConnectivity } from "../../chat/atlas-client";
import { getRunosClientConfig, verifyRunosConnectivity } from "../../runos/client";

// GET /api/platform-check - basic agent-usage-perspective verification for
// the two L1 platforms vxtpl can consume: Atlas (model gateway, GET
// /v1/models) and Runos (capability plane, GET /.well-known/vxture-tools).
// Both probes are read-only, spend no tokens/quota, and are skipped (not an
// error) when their credentials are not configured - see
// docs/80-liaison/60-2608130300-vxtpl-atlas-chat-request.md.
export const dynamic = "force-dynamic";

interface ProbeResult {
  configured: boolean;
  ok: boolean;
  detail: string;
}

async function checkAtlas(): Promise<ProbeResult> {
  const cfg = getAtlasClientConfig();
  if (!cfg) return { configured: false, ok: false, detail: "ATLAS_API_URL / ATLAS_S2S_TOKEN not set" };
  try {
    const { modelCount } = await verifyAtlasConnectivity(cfg);
    return { configured: true, ok: true, detail: `GET /v1/models -> ${modelCount} routable model(s)` };
  } catch (err) {
    return { configured: true, ok: false, detail: err instanceof Error ? err.message : "verification failed" };
  }
}

async function checkRunos(): Promise<ProbeResult> {
  const cfg = getRunosClientConfig();
  if (!cfg) return { configured: false, ok: false, detail: "RUNOS_API_URL / RUNOS_S2S_TOKEN not set" };
  try {
    const { protocolVersion, tools } = await verifyRunosConnectivity(cfg);
    return {
      configured: true,
      ok: true,
      detail: `GET /.well-known/vxture-tools -> protocol ${protocolVersion}, tools: ${tools.join(", ")}`,
    };
  } catch (err) {
    return { configured: true, ok: false, detail: err instanceof Error ? err.message : "verification failed" };
  }
}

export async function GET(): Promise<Response> {
  const [atlas, runos] = await Promise.all([checkAtlas(), checkRunos()]);
  return NextResponse.json({ atlas, runos });
}

import { assertInternalTarget } from "../lib/internal-target";

// Runos S2S caller (L1 commercial capability plane, agent-facing discovery
// only). Contract verified against the Runos interface reference (main,
// 2026-08-13), section 09 "能力发现" (GET /.well-known/vxture-tools) and
// section 04 "全部认证面". Dormant until RUNOS_API_URL + RUNOS_S2S_TOKEN are
// both configured.
//
// Scope: this client only proves agent-facing discovery works (auth + tool
// listing). It does NOT implement the full MCP streamable-HTTP protocol
// (POST /v1/mcp -> discover/resolve/invoke/report_outcome) - that requires a
// real MCP client and is out of scope for a basic capability-verification
// pass. See docs/80-liaison for the follow-up if full invoke is needed.
//
// Auth: S2sAuthGuard - RS256 JWT, aud=runos, scope=tool:runos, standard
// bearer auth. RUNOS_S2S_TOKEN is expected to already be an issued token.

export interface RunosClientConfig {
  baseUrl: string;
  authToken: string;
}

export function getRunosClientConfig(): RunosClientConfig | null {
  const baseUrl = process.env.RUNOS_API_URL;
  const authToken = process.env.RUNOS_S2S_TOKEN;
  if (!baseUrl || !authToken) return null;
  return { baseUrl, authToken };
}

export class RunosError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`runos ${status}: ${message}`);
  }
}

interface ToolDescriptor {
  name: string;
  title: string;
  description: string;
  version: string;
  deprecated: boolean;
}

interface ToolsWellKnown {
  protocol_version: string;
  tools: ToolDescriptor[];
}

/** Agent-facing discovery probe (GET /.well-known/vxture-tools) - proves S2S auth works and lists the fixed MCP tool set. */
export async function verifyRunosConnectivity(cfg: RunosClientConfig): Promise<{ protocolVersion: string; tools: string[] }> {
  const url = assertInternalTarget(`${cfg.baseUrl.replace(/\/$/, "")}/.well-known/vxture-tools`);
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${cfg.authToken}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new RunosError(res.status, body || res.statusText);
  }
  const raw = (await res.json()) as ToolsWellKnown;
  return { protocolVersion: raw.protocol_version, tools: (raw.tools ?? []).map((t) => t.name) };
}

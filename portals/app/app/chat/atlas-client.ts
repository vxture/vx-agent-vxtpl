import { assertInternalTarget } from "../lib/internal-target";
import type { ChatMessage } from "./types";

// Atlas S2S caller (L1 model supply). Mirrors the C2 platform-client shape:
// internal-network base URL + shared S2S auth header, SSRF-guarded via
// assertInternalTarget so the token never crosses the public internet in the
// clear.
//
// CONTRACT NOTE: the exact Atlas chat endpoint path and envelope are owned by
// vxture-atlas/docs/30-design/200-s2s-provider-surface.md, which is not
// checked out in this repo's environment. The path/shape below is a
// best-effort placeholder pending platform-line confirmation (see
// docs/80-liaison/60-2608130300-vxtpl-atlas-chat-request.md) - verify against
// the real spec before this resolver is ever selected in production
// (selection requires ATLAS_API_URL + ATLAS_S2S_TOKEN, neither of which is
// issued yet).

export interface AtlasClientConfig {
  baseUrl: string;
  authToken: string;
  product: string;
}

export function getAtlasClientConfig(): AtlasClientConfig | null {
  const baseUrl = process.env.ATLAS_API_URL;
  const authToken = process.env.ATLAS_S2S_TOKEN;
  if (!baseUrl || !authToken) return null; // -> Mock resolver
  return { baseUrl, authToken, product: process.env.OIDC_CLIENT_ID ?? "__PRODUCT_CODE__" };
}

export async function fetchChatCompletion(
  cfg: AtlasClientConfig,
  messages: ChatMessage[],
): Promise<ChatMessage> {
  const url = assertInternalTarget(`${cfg.baseUrl.replace(/\/$/, "")}/v1/chat`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-vxture-internal-auth": cfg.authToken,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ product: cfg.product, messages }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`atlas chat endpoint ${res.status}`);
  const raw = (await res.json()) as Record<string, unknown>;
  const content = typeof raw.reply === "string" ? raw.reply : "";
  return { role: "assistant", content };
}

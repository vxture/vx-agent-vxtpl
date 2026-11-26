/**
 * Same-origin stream of local RP session revocations.
 * @package @vxtpl/app
 * @layer Application
 * @category Route
 * @author AI-Generated
 * @date 2026-11-26
 */

import { cookies } from "next/headers";
import { getOidcConfig } from "../lib/config";
import { acceptsBrowserOrigin } from "../lib/request-origin";
import { watchSession } from "../lib/session-events";
import { getSession } from "../lib/session-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = {
  "content-type": "text/event-stream",
  "cache-control": "no-store, no-transform",
  "x-accel-buffering": "no",
};
const terminal = 'event: revoked\ndata: {}\n\n';

export async function GET(request: Request): Promise<Response> {
  const cfg = getOidcConfig();
  if (!cfg.enabled) return new Response(null, { status: 204 });
  if (!acceptsBrowserOrigin(request, cfg.appOrigin) || new URL(request.url).search) return new Response(null, { status: 403 });
  const rpsid = (await cookies()).get(cfg.cookieName)?.value;
  if (!rpsid) return new Response(null, { status: 204 });
  try {
    if (!await getSession(cfg.clientId, rpsid)) return new Response(terminal, { headers });
  } catch {
    return new Response(null, { status: 503 });
  }

  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const close = (revoked = false, cancelled = false) => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", onAbort);
        if (!cancelled) {
          if (revoked) controller.enqueue(encoder.encode(terminal));
          controller.close();
        }
      };
      const onAbort = () => close();
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(": heartbeat\n\n")), 20_000);
      const unsubscribe = watchSession(cfg.clientId, rpsid, () => close(true));
      cleanup = () => close(false, true);
      request.signal.addEventListener("abort", onAbort, { once: true });
      if (request.signal.aborted) close();
      else controller.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel: () => cleanup(),
  });
  return new Response(stream, { headers });
}

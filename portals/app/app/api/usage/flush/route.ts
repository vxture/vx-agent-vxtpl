import { checkInternalJob } from "../../../lib/internal-job";
import { runUsageJob } from "../../../usage/lib/job";

// The on-demand trigger uses the same lease and reporting scope as the scheduler.
// Only a caller with the internal job token can request a pass.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!checkInternalJob(req)) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const summary = await runUsageJob();
    return summary ? Response.json(summary, { headers: { "cache-control": "no-store" } }) : new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Usage flush unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

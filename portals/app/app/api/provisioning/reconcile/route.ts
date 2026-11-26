/**
 * Allows an internal job to trigger one provisioning reconciliation round.
 * @package @vxtpl/app
 * @layer Application
 * @category Route
 * @author AI-Generated
 * @date 2026-11-26
 */

import { checkInternalJob } from "../../../lib/internal-job";
import { runProvisioningReconciliation } from "../../../provisioning/lib/reconcile";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!checkInternalJob(request)) return new Response(null, { status: 403 });
  try {
    const result = await runProvisioningReconciliation();
    if (!result) return new Response(null, { status: 204 });
    return Response.json(result, { status: result.deferred ? 503 : 200, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Provisioning reconciliation unavailable" }, { status: 503 });
  }
}

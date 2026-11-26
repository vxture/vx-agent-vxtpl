/**
 * Starts product background jobs in the Node runtime.
 * @package @vxtpl/app
 * @layer Application
 * @category Bootstrap
 * @author AI-Generated
 * @date 2026-11-26
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startProvisioningReconciliation } = await import("./app/provisioning/lib/reconcile");
    const { startUsageJob } = await import("./app/usage/lib/job");
    startProvisioningReconciliation();
    startUsageJob();
  }
}

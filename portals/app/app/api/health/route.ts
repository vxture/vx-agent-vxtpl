import { buildHealthIdentity } from "@vxture/shared";
import { BRAND } from "@vxtpl/shared/brand";

// Liveness endpoint. 020: zero-dependency (no DB/Redis/upstream), the container
// healthcheck target, app bound to 0.0.0.0 (Dockerfile). 025: returns the full
// identity/provenance block via the platform's single-authority helper (no
// local re-implementation - see docs/60-operations TD-001 resolution).
// runtime="nodejs" so it reads the build-injected server env
// (APP_VERSION/GIT_SHA/DEPLOY_STAGE/BUILD_TIME); force-dynamic so `time` is
// per-request (proves real-time answer + clock).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return Response.json(buildHealthIdentity({ service: `${BRAND.productCode}-app`, product: BRAND.productCode }));
}

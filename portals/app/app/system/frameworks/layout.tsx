/**
 * Exposes framework samples only on local development stages.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Layout
 * @author AI-Generated
 * @date 2026-11-25
 */

import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isDeployedStage } from "../../lib/deploy-stage";

export const dynamic = "force-dynamic";

export default function FrameworksLayout({ children }: { children: ReactNode }) {
  if (isDeployedStage()) notFound();
  return children;
}

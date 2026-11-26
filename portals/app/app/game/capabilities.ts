/**
 * Registers Emberstorm features by cumulative product tier.
 * @package @vxtpl/app
 * @layer Application
 * @category Entitlement
 * @author AI-Generated
 * @date 2026-11-26
 */

import type { Tier } from "../entitlement/types";

const free = ["game:play"];
const starter = [...free, "game:unlimited-runs", "game:history"];
const pro = [...starter, "game:leaderboard", "game:trend"];
const capabilities = { free, starter, pro, business: pro, enterprise: pro };

/**
 * Lists the example's feature grants for the resolved product tier.
 * @param tier - Resolved tier used by the product matrix.
 * @returns Feature keys at this tier.
 */
export function exampleCapabilities(tier: Tier): readonly string[] {
  return capabilities[tier];
}

import type { Entitlement, Tier } from "./types";
import { TIERS, hasProductAccess } from "./types";
import { exampleCapabilities } from "./example-capabilities";

// Capability matrix (product_220 section 3). Which tier unlocks which feature is
// PRODUCT knowledge - the platform never configures feature keys, it only says
// what tier a workspace holds.
//
// The MECHANISM below (cumulative tiers, canUseFeature, minTierFor) is rigid and
// shared org-wide. The CONTENT is vxtpl's, and a product copied from vxtpl
// replaces it. Optional domain capabilities come from the installed example.

export type FeatureKey = string;

// Cumulative per tier: a higher tier includes everything the lower ones have.
export const CAPABILITY_MATRIX: Record<Tier, FeatureKey[]> = {
  free: ["model:chat-cheap", ...exampleCapabilities("free")],
  starter: [
    "model:chat-cheap",
    "model:chat-default",
    "skill:document-conversion",
    "skill:summarize",
    ...exampleCapabilities("starter"),
  ],
  pro: [
    "model:chat-cheap",
    "model:chat-default",
    "model:chat-pro",
    "model:atlas-granted",
    "skill:document-conversion",
    "skill:summarize",
    "skill:web-search",
    ...exampleCapabilities("pro"),
  ],
  business: [
    "model:chat-cheap",
    "model:chat-default",
    "model:chat-pro",
    "model:atlas-granted",
    "skill:document-conversion",
    "skill:summarize",
    "skill:web-search",
    "skill:code-exec",
    ...exampleCapabilities("business"),
  ],
  enterprise: [
    "model:chat-cheap",
    "model:chat-default",
    "model:chat-pro",
    "model:atlas-granted",
    "skill:document-conversion",
    "skill:summarize",
    "skill:web-search",
    "skill:code-exec",
    "skill:data-analysis",
    ...exampleCapabilities("enterprise"),
  ],
};

export function canUseFeature(e: Entitlement, key: FeatureKey): boolean {
  if (!hasProductAccess(e) || e.tier == null) return false;
  return CAPABILITY_MATRIX[e.tier].includes(key);
}

/** Lowest tier that unlocks a feature, or null if no tier grants it. */
export function minTierFor(key: FeatureKey): Tier | null {
  for (const tier of TIERS) {
    if (CAPABILITY_MATRIX[tier].includes(key)) return tier;
  }
  return null;
}

import type { Entitlement, Tier } from "./types";
import { TIERS, hasProductAccess } from "./types";

// Capability matrix (product_220 section 3). Which tier unlocks which feature is
// PRODUCT knowledge - the platform never configures feature keys, it only says
// what tier a workspace holds.
//
// The MECHANISM below (cumulative tiers, canUseFeature, minTierFor) is rigid and
// shared org-wide. The CONTENT is vxtpl's, and a product copied from vxtpl
// replaces it: these keys describe vxtpl's chat models and skills, and mean
// nothing anywhere else.

export type FeatureKey = string;

// Cumulative per tier: a higher tier includes everything the lower ones have.
export const CAPABILITY_MATRIX: Record<Tier, FeatureKey[]> = {
  free: ["model:chat-cheap"],
  starter: ["model:chat-cheap", "model:chat-default", "skill:summarize"],
  pro: ["model:chat-cheap", "model:chat-default", "model:chat-pro", "skill:summarize", "skill:web-search"],
  business: [
    "model:chat-cheap",
    "model:chat-default",
    "model:chat-pro",
    "skill:summarize",
    "skill:web-search",
    "skill:code-exec",
  ],
  enterprise: [
    "model:chat-cheap",
    "model:chat-default",
    "model:chat-pro",
    "skill:summarize",
    "skill:web-search",
    "skill:code-exec",
    "skill:data-analysis",
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

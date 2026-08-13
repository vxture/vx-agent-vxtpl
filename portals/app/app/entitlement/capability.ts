import type { Entitlement, Tier } from "./types";
import { TIERS, hasProductAccess } from "./types";

// Capability matrix MECHANISM (product_220 section 3). tier -> feature keys is
// PRODUCT knowledge - the platform never configures feature keys. The template
// ships the versioned mechanism plus an EMPTY matrix; the concrete FEATURE_KEYS
// and their tier assignment are a blank zone (product_240 section 2.9) that each
// product fills in its own repo. No domain feature keys ship in the template.

export type FeatureKey = string;

// Cumulative per tier (a higher tier includes everything lower tiers have).
// Demo feature keys for the chat capability-verification surface (model +
// skill selection, see chat/catalog.ts) - the first real content in this
// blank zone, filled in by vxtpl itself as a product would.
export const CAPABILITY_MATRIX: Record<Tier, FeatureKey[]> = {
  free: ["model:chat-default"],
  starter: ["model:chat-default", "model:chat-quality", "skill:summarize"],
  pro: ["model:chat-default", "model:chat-quality", "model:chat-reasoning", "skill:summarize", "skill:web-search"],
  business: [
    "model:chat-default",
    "model:chat-quality",
    "model:chat-reasoning",
    "skill:summarize",
    "skill:web-search",
    "skill:code-exec",
  ],
  enterprise: [
    "model:chat-default",
    "model:chat-quality",
    "model:chat-reasoning",
    "model:chat-frontier",
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

import type { Entitlement, Tier } from "./types";
import { TIERS, hasProductAccess } from "./types";

// Capability matrix (product_220 section 3). Which tier unlocks which feature is
// PRODUCT knowledge - the platform never configures feature keys, it only says
// what tier a workspace holds.
//
// The MECHANISM below (cumulative tiers, canUseFeature, minTierFor) is rigid and
// shared org-wide. The CONTENT is vxtpl's, and a product copied from vxtpl
// replaces it: these keys describe vxtpl's chat models/skills and its challenge
// game (ADR-006), and mean nothing anywhere else.
//
// The game ladder (docs/20-specs/20-challenge-game.md) unlocks exactly one
// capability per step: free plays under a daily quota, starter removes the
// quota and gains personal history, pro gains the global leaderboard and the
// season trend. business/enterprise add nothing on the game axis - the design
// is a three-step ladder, and the cumulative matrix carries it upward for free.

export type FeatureKey = string;

// Cumulative per tier: a higher tier includes everything the lower ones have.
export const CAPABILITY_MATRIX: Record<Tier, FeatureKey[]> = {
  free: ["model:chat-cheap", "game:play"],
  starter: [
    "model:chat-cheap",
    "model:chat-default",
    "skill:summarize",
    "game:play",
    "game:unlimited-runs",
    "game:history",
  ],
  pro: [
    "model:chat-cheap",
    "model:chat-default",
    "model:chat-pro",
    "skill:summarize",
    "skill:web-search",
    "game:play",
    "game:unlimited-runs",
    "game:history",
    "game:leaderboard",
    "game:trend",
  ],
  business: [
    "model:chat-cheap",
    "model:chat-default",
    "model:chat-pro",
    "skill:summarize",
    "skill:web-search",
    "skill:code-exec",
    "game:play",
    "game:unlimited-runs",
    "game:history",
    "game:leaderboard",
    "game:trend",
  ],
  enterprise: [
    "model:chat-cheap",
    "model:chat-default",
    "model:chat-pro",
    "skill:summarize",
    "skill:web-search",
    "skill:code-exec",
    "skill:data-analysis",
    "game:play",
    "game:unlimited-runs",
    "game:history",
    "game:leaderboard",
    "game:trend",
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

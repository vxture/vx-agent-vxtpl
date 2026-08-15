import { canUseFeature, minTierFor, type FeatureKey } from "../entitlement/capability";
import type { Entitlement, Tier } from "../entitlement/types";

// vxtpl's model and skill catalog. Which tier unlocks which entry lives in
// entitlement/capability.ts CAPABILITY_MATRIX; this file is only the inventory.
//
// The model codes are Atlas `endpointCode` values, and they have to be real: an
// unknown code answers 404 ENDPOINT_NOT_ROUTABLE at call time, not at deploy
// time. The three below are the chat endpoints Atlas actually routes today.
// There is no runtime way to validate this list - GET /v1/models is not
// grant-filtered and returns the whole global catalog, and the endpoint registry
// is operator-only - so this catalog is kept in sync by liaison. Adding an entry
// means asking the platform line to create the endpoint AND grant it to vxtpl.
//
// The skill codes are vxtpl's own labels. skill-runner.ts maps each to a Runos
// catalog search rather than a hard-coded capability id, because the entitled
// catalog is per-caller and changes without vxtpl redeploying.

export interface ModelOption {
  code: string;
  label: string;
  featureKey: FeatureKey;
}

export interface SkillOption {
  code: string;
  label: string;
  featureKey: FeatureKey;
}

export const MODEL_CATALOG: ModelOption[] = [
  { code: "chat/cheap", label: "Economy", featureKey: "model:chat-cheap" },
  { code: "chat/default", label: "Standard", featureKey: "model:chat-default" },
  { code: "chat/pro", label: "Pro", featureKey: "model:chat-pro" },
];

export const SKILL_CATALOG: SkillOption[] = [
  { code: "summarize", label: "Summarize", featureKey: "skill:summarize" },
  { code: "web-search", label: "Web search", featureKey: "skill:web-search" },
  { code: "code-exec", label: "Code execution", featureKey: "skill:code-exec" },
  { code: "data-analysis", label: "Data analysis", featureKey: "skill:data-analysis" },
];

export function findModel(code: string): ModelOption | undefined {
  return MODEL_CATALOG.find((m) => m.code === code);
}

export function findSkill(code: string): SkillOption | undefined {
  return SKILL_CATALOG.find((s) => s.code === code);
}

export interface GatedOption {
  code: string;
  label: string;
  allowed: boolean;
  requiredTier: Tier | null;
}

function gate(options: { code: string; label: string; featureKey: FeatureKey }[], e: Entitlement): GatedOption[] {
  return options.map((o) => ({
    code: o.code,
    label: o.label,
    allowed: canUseFeature(e, o.featureKey),
    requiredTier: minTierFor(o.featureKey),
  }));
}

/** Full catalog with per-tier allow/deny for the given entitlement - used by GET /api/chat. */
export function gatedModels(e: Entitlement): GatedOption[] {
  return gate(MODEL_CATALOG, e);
}

export function gatedSkills(e: Entitlement): GatedOption[] {
  return gate(SKILL_CATALOG, e);
}

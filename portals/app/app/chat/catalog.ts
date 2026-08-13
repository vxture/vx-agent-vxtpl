import { canUseFeature, minTierFor, type FeatureKey } from "../entitlement/capability";
import type { Entitlement, Tier } from "../entitlement/types";

// Demo model/skill catalog for the chat capability-verification surface.
// Gating (which tier unlocks which entry) lives in entitlement/capability.ts
// CAPABILITY_MATRIX - product-decided blank-zone content, same mechanism any
// real product would use.
//
// SIMPLIFICATION: model `code` values are Atlas endpointCode candidates -
// only "chat/default" is confirmed against the real Atlas interface
// reference (see chat/atlas-client.ts); the others are demo placeholders
// that may not resolve on a real Atlas instance. Skill `code` values are
// purely local labels - real Runos skill discovery/invoke requires the full
// MCP protocol, explicitly out of scope for now (see
// docs/80-liaison/70-2608131500-vxtpl-runos-capability-check-request.md).
// Neither catalog is fetched live from Atlas/Runos; a real product would
// replace this file with one derived from GET /v1/models and Runos
// discovery, still gated the same way.

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
  { code: "chat/default", label: "Standard", featureKey: "model:chat-default" },
  { code: "chat/quality", label: "Quality", featureKey: "model:chat-quality" },
  { code: "chat/reasoning", label: "Reasoning", featureKey: "model:chat-reasoning" },
  { code: "chat/frontier", label: "Frontier", featureKey: "model:chat-frontier" },
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

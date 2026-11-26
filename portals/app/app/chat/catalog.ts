import { canUseFeature, minTierFor, type FeatureKey } from "../entitlement/capability";
import type { Entitlement, Tier } from "../entitlement/types";
import type { MintOptions } from "../lib/s2s-token";
import { listGrantedEndpoints, type AtlasClientConfig } from "./atlas-client";
import { DOCUMENT_CONVERSION_SKILL } from "./types";

interface FeatureOption {
  code: string;
  label: string;
  featureKey: FeatureKey;
}

// These entries preserve existing labels and subscription tiers for known
// routes. Atlas controls membership in the live list.
const MODEL_TIER_RULES = new Map<string, Omit<FeatureOption, "code">>([
  ["chat/default", { label: "Standard", featureKey: "model:chat-default" }],
  ["chat/cheap", { label: "Economy", featureKey: "model:chat-cheap" }],
  ["chat/pro", { label: "Pro", featureKey: "model:chat-pro" }],
]);

export const DEFAULT_MOCK_MODEL = "chat/default";
const MOCK_MODELS = Array.from(MODEL_TIER_RULES, ([code, policy]) => ({ code, ...policy }));

export const SKILL_CATALOG: FeatureOption[] = [
  { code: DOCUMENT_CONVERSION_SKILL, label: "Convert and summarize HTML", featureKey: "skill:document-conversion" },
  { code: "summarize", label: "Summarize", featureKey: "skill:summarize" },
  { code: "web-search", label: "Web search", featureKey: "skill:web-search" },
  { code: "code-exec", label: "Code execution", featureKey: "skill:code-exec" },
  { code: "data-analysis", label: "Data analysis", featureKey: "skill:data-analysis" },
];

export function findSkill(code: string): FeatureOption | undefined {
  return SKILL_CATALOG.find((s) => s.code === code);
}

export interface GatedOption {
  code: string;
  label: string;
  allowed: boolean;
  requiredTier: Tier | null;
}

function gate(options: FeatureOption[], e: Entitlement): GatedOption[] {
  return options.map((o) => ({
    code: o.code,
    label: o.label,
    allowed: canUseFeature(e, o.featureKey),
    requiredTier: minTierFor(o.featureKey),
  }));
}

/**
 * Builds chat choices from the live Atlas directory and applies product tiers.
 * @param cfg - Atlas runtime configuration.
 * @param identity - Server-owned ticket exchange identity.
 * @param entitlement - Product entitlement for the current workspace.
 * @returns Live chat choices, with each choice's product availability.
 * @throws When the Atlas directory cannot be read.
 */
export async function readAtlasChatModels(
  cfg: AtlasClientConfig,
  identity: MintOptions,
  entitlement: Entitlement,
): Promise<GatedOption[]> {
  const routes = await listGrantedEndpoints(cfg, identity);
  const codes = new Set(routes.filter(({ category, state }) => category === "chat" && state === "active")
    .map(({ endpointCode }) => endpointCode));
  return gate(Array.from(codes, (code) => ({
    code,
    ...(MODEL_TIER_RULES.get(code) ?? { label: code, featureKey: "model:atlas-granted" }),
  })), entitlement);
}

/** Offline examples for development without an Atlas connection. */
export function gatedMockModels(entitlement: Entitlement): GatedOption[] {
  return gate(MOCK_MODELS, entitlement);
}

/**
 * Resolves an explicit route or defaults to the first eligible directory entry.
 * @param models - Choices read for the current request.
 * @param requested - Route selected by the caller, if present.
 * @returns An eligible route code or undefined if no matching route is eligible.
 */
export function chooseChatModel(models: GatedOption[], requested?: string): string | undefined {
  return models.find((model) => model.allowed && (requested === undefined || model.code === requested))?.code;
}

export function gatedSkills(e: Entitlement): GatedOption[] {
  return gate(SKILL_CATALOG, e);
}

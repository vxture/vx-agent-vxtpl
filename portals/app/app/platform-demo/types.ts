/**
 * Browser-safe status and receipts for the platform integration demo.
 * @package @vxtpl/app
 * @layer Shared
 * @category Contract
 * @author AI-Generated
 * @date 2026-11-26
 */

import type { AtlasModelChoice } from "../chat/types";
export type { AtlasModelChoice } from "../chat/types";

export type Check = { state: "verified" | "waiting" | "blocked" | "unavailable"; detail: string };
export const PROBES = ["c3-replay", "atlas-inference", "atlas-model-inference", "runos-invoke"] as const;
export type Probe = (typeof PROBES)[number];
export const DAILY_PROBES = ["atlas-inference", "atlas-model-inference", "runos-invoke"] as const satisfies readonly Probe[];
export type DailyProbe = (typeof DAILY_PROBES)[number];
export type ProbeCommand =
  | { probe: Exclude<Probe, "atlas-model-inference"> }
  | { probe: "atlas-model-inference"; modelCode: string };
export type PlatformReport = {
  checkedAt: string;
  stage: "dev" | "beta" | "production";
  scopeKey: string | null;
  actions: Record<Probe, boolean>;
  actionDetails: Record<Probe, string>;
  atlasModelChoices: AtlasModelChoice[];
  receipts: Partial<Record<DailyProbe, ProbeReceipt>>;
  checks: {
    issuer: Check;
    session: Check;
    exchange: Check;
    access: Check;
    roster: Check;
    entitlements: Check;
    provisioning: Check;
    atlas: Check;
    atlasModels: Check;
    runos: Check;
  };
};

export type ProbeReceipt = {
  ok: boolean;
  detail: string;
  code?: "WORKSPACE_CHANGED" | "ATLAS_MODEL_UNAVAILABLE";
  receipt?: string;
  responseText?: string;
  evidence?:
    | ({ provider: "atlas"; taskId: string; modelCode: string } & (
      | { endpointCode: string; requestedModelCode?: never }
      | { requestedModelCode: string; endpointCode?: never }
    ))
    | { provider: "runos"; taskId: string; capabilityId: string; outcomeAcknowledged: true };
};

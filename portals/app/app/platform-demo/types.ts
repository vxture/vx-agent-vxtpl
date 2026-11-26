/**
 * Browser-safe status and receipts for the platform integration demo.
 * @package @vxtpl/app
 * @layer Shared
 * @category Contract
 * @author AI-Generated
 * @date 2026-11-26
 */

export type Check = { state: "verified" | "waiting" | "blocked" | "unavailable"; detail: string };
export type Probe = "c3-replay" | "atlas-inference" | "runos-invoke";

export type PlatformReport = {
  checkedAt: string;
  stage: "dev" | "beta" | "production";
  scopeKey: string | null;
  actions: Record<Probe, boolean>;
  checks: {
    issuer: Check;
    session: Check;
    exchange: Check;
    access: Check;
    roster: Check;
    entitlements: Check;
    provisioning: Check;
    atlas: Check;
    runos: Check;
  };
};

export type ProbeReceipt = { ok: boolean; detail: string; receipt?: string };

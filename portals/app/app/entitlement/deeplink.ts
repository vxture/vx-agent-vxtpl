import { BRAND } from "@vxtpl/shared/brand";
import type { Tier } from "./types";

// Conversion deep-link constructor (product_200 section 3.2): the single
// conversion exit to vxture-console. Attach ONLY to an explicit user click -
// never auto-redirect. product + intent are required; workspace_id is resolved
// by the console session and MUST NOT be sent by the product.

export type Intent = "upgrade" | "renew" | "addon";

export function subscribeUrl(opts: { intent: Intent; targetTier?: Tier; metric?: string }): string {
  const base = (process.env.NEXT_PUBLIC_CONSOLE_URL ?? "https://console.vxture.com").replace(/\/$/, "");
  const u = new URL(`${base}/subscribe`);
  u.searchParams.set("product", BRAND.productCode);
  u.searchParams.set("intent", opts.intent);
  if (opts.targetTier) u.searchParams.set("target_tier", opts.targetTier);
  if (opts.metric) u.searchParams.set("metric", opts.metric);
  return u.toString();
}

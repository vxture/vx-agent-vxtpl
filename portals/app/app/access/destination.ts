/**
 * Product destinations used by entry and authentication recovery.
 * @package @vxtpl/app
 * @layer Application
 * @category Navigation
 * @author AI-Generated
 * @date 2026-11-25
 */

import { safeReturnTo } from "../auth/lib/return-to";
import { defaultProductPath, productGateHref, productRoutes } from "../framework/product-experience";

export type GateFailure = "cancelled" | "callback" | "unavailable";

function productPath(value: string | null | undefined): string {
  const path = safeReturnTo(value);
  try {
    const pathname = decodeURIComponent(new URL(path, "https://product.invalid").pathname);
    if (pathname !== "/" && !/^\/(?:api|auth|gate|_next)(?:\/|$)/i.test(pathname) && !pathname.startsWith("//") && !pathname.includes("\\")) {
      return path;
    }
  } catch {
    // A malformed percent escape cannot name a product page.
  }
  return defaultProductPath();
}

export function gateDestination(value: string | null | undefined): string {
  return productPath(value);
}

export function gateLoginHref(destination: string): string {
  return `/auth/login?returnTo=${encodeURIComponent(productGateHref(productPath(destination)))}`;
}

export function gateFailureHref(returnTo: string | undefined, failure: GateFailure): string {
  const target = new URL(safeReturnTo(returnTo), "https://product.invalid");
  const destination = target.pathname === productRoutes.gate ? target.searchParams.get("from") : returnTo;
  return `${productGateHref(productPath(destination))}&result=${failure}`;
}

export function gateFailure(value: unknown): GateFailure | undefined {
  return value === "cancelled" || value === "callback" || value === "unavailable" ? value : undefined;
}

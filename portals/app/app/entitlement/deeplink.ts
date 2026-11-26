import { BRAND } from "@vxtpl/shared/brand";

// The website selects locale and routes the user to the appropriate plan.

export function subscribeUrl(): string {
  const u = new URL("/pricing", process.env.NEXT_PUBLIC_WEBSITE_URL || "https://vxture.com");
  u.searchParams.set("product", BRAND.productCode);
  return u.toString();
}

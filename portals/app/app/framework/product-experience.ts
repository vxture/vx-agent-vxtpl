/**
 * Product route and home mode configuration.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Configuration
 * @author AI-Generated
 * @date 2026-11-25
 */

import profile from "../../product.config.json";

type HomeMode = "overview" | "direct";

interface ProductExperience {
  readonly homeMode: HomeMode;
  readonly directDestination: string;
  readonly example: { label: string; href: string } | null;
}

const config: Omit<ProductExperience, "homeMode"> & { homeMode: string } = profile;

export const productRoutes = {
  landing: "/",
  home: "/home",
  work: "/home/work",
  play: "/play",
  chat: "/chat",
  gate: "/gate",
  frameworks: "/system/frameworks",
} as const;

export const productExperience: ProductExperience = {
  homeMode: config.homeMode === "direct" ? "direct" : "overview",
  directDestination: [productRoutes.home, productRoutes.chat, config.example?.href].includes(config.directDestination)
    ? config.directDestination
    : productRoutes.home,
  example: config.example,
};

export function defaultProductPath(): string {
  return productExperience.homeMode === "direct" ? productExperience.directDestination : productRoutes.home;
}

export function productGateHref(destination: string): string {
  return `${productRoutes.gate}?from=${encodeURIComponent(destination)}`;
}

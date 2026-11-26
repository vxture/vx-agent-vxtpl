/**
 * Product route and home mode configuration.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Configuration
 * @author AI-Generated
 * @date 2026-11-25
 */

import profile from "../../product.config.json";
import { parseHeadlineSettings, type HeadlineSettings } from "./headline-rotation";

type HomeMode = "overview" | "direct";

interface ProductExperience {
  readonly homeMode: HomeMode;
  readonly homeHeadline: HeadlineSettings;
  readonly directDestination: string;
  readonly example: { label: string; href: string } | null;
}

const config: Omit<ProductExperience, "homeMode" | "homeHeadline"> & { homeMode: string; homeHeadline?: unknown } = profile;

export const productRoutes = {
  landing: "/",
  home: "/home",
  work: "/home/work",
  play: "/play",
  chat: "/chat",
  gate: "/gate",
  platformCheck: "/platform-check",
  frameworks: "/system/frameworks",
} as const;

export const productExperience: ProductExperience = {
  homeHeadline: parseHeadlineSettings(config.homeHeadline),
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

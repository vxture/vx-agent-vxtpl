/**
 * Route inventory for the local framework catalogue.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Configuration
 * @author AI-Generated
 * @date 2026-11-25
 */

import { productRoutes } from "../../framework/product-experience";

const base = productRoutes.frameworks;

export const frameworkSamples = [
  { key: "home", title: "Home", href: productRoutes.home, summary: "Product workspace overview" },
  { key: "business", title: "Business", href: `${base}/business`, summary: "Workspace with optional resources and properties" },
  { key: "canvas", title: "Map canvas", href: `${base}/canvas`, summary: "Fullscreen stage with dedicated dark header" },
  { key: "gate", title: "Gate", href: productRoutes.gate, summary: "Workspace access and entitlement checkpoint" },
  { key: "management", title: "Management", href: `${base}/management`, summary: "Fixed navigation and flat tables" },
] as const;

export const managementPages = [
  { key: "catalog", title: "Framework catalogue", href: `${base}/management`, summary: "Read-only index", icon: "table" },
  { key: "select", title: "Row selection", href: `${base}/management/select`, summary: "Individual selection", icon: "check" },
  { key: "bulk", title: "Bulk selection", href: `${base}/management/bulk`, summary: "Selection of visible results", icon: "list-checks" },
] as const;

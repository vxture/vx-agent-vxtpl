// Product brand constants - the single source of product identity. Everything
// that names the product (health payload, C2 entitlement lookups, C3 webhook
// product check, Atlas tenant attribution) reads productCode from here, never
// from OIDC_CLIENT_ID: the beta OIDC client is `vxtpl-beta` while the product
// code stays `vxtpl`, so deriving one from the other misidentifies the product
// on any non-prod stack. `scripts/init/rename-product.mjs` rewrites these two
// values when a new product repo is copied from vxtpl.
export const BRAND = {
  productCode: "vxtpl",
  displayName: "Vxtpl",
  defaultLocale: "en",
} as const;

export type Brand = typeof BRAND;

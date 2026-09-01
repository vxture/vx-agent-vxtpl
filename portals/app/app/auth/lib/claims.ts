// Access-token claim parsing and the governance-role gate (080-rp section 2.6).
//
// CRITICAL - this is where two CONFIRMED integration bugs live in arda
// (product_240 section 6 #27/#28). vxtpl must not repeat them, and neither must
// anything copied from vxtpl - the tests below are the guard:
//   1. The platform NEVER issues `admin`. The governance value domain is exactly
//      owner / manager / member / readonly / guest (data_identity_200 section
//      6.4 seed). Treating `admin` as a manage role, or expecting it, is wrong.
//   2. roles[] is a SCOPE-PREFIXED string array, e.g. ["org:owner",
//      "workspace:owner"] - not bare role codes. A consumer that compares a bare
//      `owner` misses `workspace:owner` and mis-gates the admin surface. So the
//      manage check compares against the scope-prefixed set, never a bare code.

export const GOVERNANCE_ROLE_CODES = [
  "owner",
  "manager",
  "member",
  "readonly",
  "guest",
] as const;
export type GovernanceRoleCode = (typeof GOVERNANCE_ROLE_CODES)[number];

// "Can manage this org/workspace" = role in this scope-prefixed set (080-rp
// section 2.6). owner is full authority; manager manages members/roles/settings
// (not billing/ownership). member/readonly/guest have no governance authority.
const MANAGE_ROLES = new Set(["org:owner", "workspace:owner", "workspace:manager"]);

export interface ScopedRole {
  scope: string; // e.g. "org" | "workspace"
  role: string; // e.g. "owner" | "manager" | ...
}

export function parseRoles(roles: readonly string[]): ScopedRole[] {
  return roles.map((raw) => {
    const r = raw.trim().toLowerCase();
    const idx = r.indexOf(":");
    return idx === -1
      ? { scope: "", role: r }
      : { scope: r.slice(0, idx), role: r.slice(idx + 1) };
  });
}

export function canManageWorkspace(roles: readonly string[]): boolean {
  return roles.some((r) => MANAGE_ROLES.has(r.trim().toLowerCase()));
}

// workspace:owner = owner baseline for EVERY product subscribed under that
// workspace (080-rp section 2.6 / product_240 section 8): first-login super-admin,
// which resolves the product-bootstrap "who is the first admin" problem. Product
// authorization = isWorkspaceOwner(token) || product-local authz grant.
export function isWorkspaceOwner(roles: readonly string[]): boolean {
  return roles.some((r) => r.trim().toLowerCase() === "workspace:owner");
}

// Verified access-token claims we consume. entitlement is NOT here (D12: never in
// token, always fetched via C2). Business/product-function roles are NOT here
// (resolved from the product's own DB by (active_workspace, sub)).
export interface AccessClaims {
  sub: string;
  active_org?: string;
  active_org_type?: string;
  active_workspace?: string;
  roles?: string[];
  account_status?: string;
}

export interface AuthUser {
  sub: string; // full "usr_<uuid>" - stored verbatim by the product DB
  activeOrg: string | null;
  activeOrgType: string | null; // "personal" | "organization"
  activeWorkspace: string | null;
  roles: string[]; // raw scope-prefixed, as issued
  accountStatus: string | null; // read per-request from token, never stored
  canManage: boolean;
  isWorkspaceOwner: boolean;
}

// Display-only profile claims from the id_token ("openid profile email" is
// in OIDC_SCOPES). The id_token's signature and nonce were verified at the
// callback; here the payload is only RE-READ for profile fields, so a decode
// without an exp check is correct - the short-lived id_token expiring
// mid-session must not blank the user's name. Never used for authorization.
export interface IdProfile {
  displayName: string | null;
  picture: string | null;
  email: string | null;
}

export function profileFromIdToken(idToken: string): IdProfile {
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return {
      displayName: s(payload["name"]) ?? s(payload["nickname"]) ?? s(payload["preferred_username"]),
      picture: s(payload["picture"]),
      email: s(payload["email"]),
    };
  } catch {
    return { displayName: null, picture: null, email: null };
  }
}

export function toAuthUser(claims: AccessClaims): AuthUser {
  const roles = Array.isArray(claims.roles) ? claims.roles : [];
  return {
    sub: claims.sub,
    activeOrg: claims.active_org ?? null,
    activeOrgType: claims.active_org_type ?? null,
    activeWorkspace: claims.active_workspace ?? null,
    roles,
    accountStatus: claims.account_status ?? null,
    canManage: canManageWorkspace(roles),
    isWorkspaceOwner: isWorkspaceOwner(roles),
  };
}

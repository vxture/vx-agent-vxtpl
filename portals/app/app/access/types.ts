import type { AuthUser } from "../auth/lib/claims";
import type { Cta, Entitlement } from "../entitlement/types";

// The product front door's vocabulary.
//
// One discriminated union rather than a bag of booleans, because the states are
// genuinely exclusive and each wants a DIFFERENT next action. Flattening them
// into `{ authenticated, hasAccess }` loses exactly the distinctions that decide
// what the button should say - and a gate whose button is wrong is worse than
// no gate, because it sends people somewhere that cannot help them.

export interface AccessGates {
  productAccess: boolean;
  dataAccess: boolean;
  cta: Cta;
}

export type AccessState =
  /** No session. Signing in is the move. */
  | { status: "anonymous" }
  /**
   * Signed in and entitled-or-not; `gates` says which. Kept as one state
   * because the user is the same person either way - what differs is whether
   * the product lets them in or asks them to subscribe.
   */
  | { status: "authenticated"; user: AuthUser; entitlement: Entitlement; gates: AccessGates }
  /**
   * Signed in, but the account is suspended or closed. Explicitly NOT
   * anonymous: offering "sign in" here loops the user through an IdP that will
   * hand back the same dead account.
   */
  | { status: "inactive-account" }
  /**
   * Signed in with no active workspace. Re-authenticating cannot add one, so
   * the way out is the console, not the login page.
   */
  | { status: "no-workspace"; user: AuthUser }
  /**
   * Sign-in is not provisioned on this deployment. A dead end that is ours to
   * fix, not the visitor's - so the gate says so instead of offering a button
   * that lands on a 503.
   */
  | { status: "unconfigured" }
  /**
   * Local development with no IdP. The gate stands aside; without this the
   * front door is a wall no developer can open. Never reachable on a deployed
   * stage - `/api/access` only returns it when DEPLOY_STAGE is dev.
   */
  | { status: "open"; reason: "dev-no-oidc" };

/** Whether this state should let the visitor through to the product. */
export function isThrough(state: AccessState): boolean {
  if (state.status === "open") return true;
  return state.status === "authenticated" && state.gates.productAccess;
}

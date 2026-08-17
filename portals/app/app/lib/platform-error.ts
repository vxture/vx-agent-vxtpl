// The error vocabulary shared across every Vxture capability plane.
//
// Atlas and Runos converged on one envelope (product_251 X-1): `code` is always
// present, `message` is human-readable, and `retryable` is the callee's own
// answer rather than something the caller infers from a status code. Getting
// that answer from the body matters because the two failure modes look
// identical from outside: a capacity gate clears on its own, a commercial quota
// ceiling needs an operator, and both are "you may not proceed right now".
//
// Some codes carry NO module prefix on purpose. They mean the same thing on
// every plane, so a caller should match ONE constant rather than maintaining a
// branch per callee - which is exactly the drift that makes multi-provider error
// handling rot. Everything else is prefixed with its module (`CALLER_*`,
// `CAPABILITY_*`, `S2S_TOKEN_*`), so two domains cannot collide.
//
// FOUR of the five below are normative in the standard. `RATE_LIMITED` is not:
// it is a fleet convention that both live planes already implement unprefixed,
// on the standard's own reasoning, ahead of a spec amendment (Runos ADR-017 /
// TD-017 calls this out explicitly). Coding all five is right - matching the
// wire beats matching the document - but the distinction is worth keeping
// visible, because the unwritten one is the one that could still move.

/** Rejections that mean the same thing on Atlas, Runos, and any future plane. */
export const SHARED_REJECTION_CODES = [
  /** The calling product holds no grant. An operator action, not a retry. */
  "NOT_ENTITLED",
  /** The operation's risk level exceeds what the grant scopes. */
  "POLICY_DENIED",
  /** A critical operation needs human approval first. */
  "APPROVAL_REQUIRED",
  /** Commercial ceiling. Cumulative with no rollover - only an operator resets it. */
  "QUOTA_EXCEEDED",
  /**
   * Capacity gate, and the one rejection that clears on its own - which is why
   * it is the only retryable member of the set, and why it must not be lumped in
   * with the commercial ceiling above. Fleet convention, not yet normative.
   */
  "RATE_LIMITED",
] as const;

export type SharedRejectionCode = (typeof SHARED_REJECTION_CODES)[number];

const SHARED = new Set<string>(SHARED_REJECTION_CODES);

export function isSharedRejection(code: string | undefined): code is SharedRejectionCode {
  return code !== undefined && SHARED.has(code);
}

/**
 * A rejection the user should be told about, as opposed to a fault to log.
 *
 * All five shared codes are the platform saying "this is not available to you",
 * which a person can sometimes act on (upgrade, ask an operator, wait). A
 * provider fault or a payload bug is ours to fix and theirs to be spared.
 */
export function isEntitlementRejection(code: string | undefined): boolean {
  return code === "NOT_ENTITLED" || code === "POLICY_DENIED" || code === "APPROVAL_REQUIRED" || code === "QUOTA_EXCEEDED";
}

/**
 * The envelope both planes now answer with. `retryable` is required by the
 * standard and always sent by both, so it is not optional here - a client that
 * treats it as maybe-absent quietly reintroduces the status-code guessing this
 * field exists to end.
 *
 * Beyond these three the field sets diverge: `retryAfterMs` is Atlas-only, and
 * Runos carries `call_id` instead. Each client extends this rather than one
 * union pretending both planes answer the same way.
 */
export interface PlatformErrorBody {
  code: string;
  message: string;
  retryable: boolean;
  /** Atlas only, on RATE_LIMITED, when it can say how long to wait. */
  retryAfterMs?: number;
}

/**
 * Read the callee's own retry answer, falling back to a status-based guess.
 *
 * The fallback exists only for a transport-level failure that never reached the
 * application (a proxy 502, say) - once a body carries `retryable`, that value
 * wins, including when it says false on a 429. A commercial ceiling can arrive
 * as 429 and must not be retried.
 */
export function isRetryable(body: Partial<PlatformErrorBody> | undefined, status: number): boolean {
  if (typeof body?.retryable === "boolean") return body.retryable;
  // Reached only when nothing parseable came back - a proxy 502, a timeout body,
  // a truncated response. Not a second opinion about an application answer.
  return status === 429 || (status >= 500 && status < 600);
}

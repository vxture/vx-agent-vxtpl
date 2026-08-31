# ADR-006: vxtpl carries a real business domain - the 20-Second Challenge

- **Status:** accepted
- **Date:** 2026-08-31 (records an owner decision: make vxtpl a usable product
  with real users, from the owner's game design document)

## Context

The product definition said "no business domain" on the argument that a fake
domain would make the reference harder to read. That argument was correct about
FAKE domains and silent about real ones - and it left the exemplar zone half
empty. The capability matrix gated models nobody chose for a reason, the domain
schema slot ("N domain schemas") had no worked example at all, and a copy's
first real task - counting a quota against its own domain table - had nothing
to copy.

Meanwhile ADR-001 already committed vxtpl to being a deployed product, on the
reasoning that a reference nobody runs drifts. The same reasoning extends one
step: a product nobody USES exercises the integration surface but not the
product surface. Tier gating that no user ever hits is verified by review, not
by execution.

The owner supplied the domain: a 20-second bullet-dodging challenge designed
specifically to exercise the subscription machinery - a daily quota (free), a
personal-record unlock (starter), and a leaderboard + trend unlock (pro), each
tier adding exactly one capability over the same game.

## Decision

vxtpl's business domain is the 20-Second Challenge
(`docs/20-specs/20-challenge-game.md`). Consequences by zone:

- **Exemplar zone, now fully worked.** The capability matrix carries `game:*`
  keys alongside the chat keys; `vxtpl_game.run` is the worked domain schema
  (self-contained increment `incr/0001` with its own grants and column locks);
  `game/rules.ts` shows platform-limit-overrides-product-default quota
  arithmetic; the three game surfaces show locked-state and CTA design. A copy
  replaces the content, exactly as before - there is simply content to replace
  now.
- **Rigid zone untouched.** Gating formulas, C1/C2/C3 semantics, usage
  buffering, DDL governance, and the deeplink conversion exit are consumed
  unchanged. The game meters `vxtpl.game.runs` through the same buffered
  counter path as `vxtpl.chat.messages`.
- **Pricing stays out of the product.** Tier cards name what each step unlocks;
  every conversion exit is `subscribeUrl()` into the console, which owns money.

## Consequences

- The "no business domain" paragraph of the product definition is superseded;
  the definition now names the game as the domain and keeps the reference role.
- The platform metric registry needs `vxtpl.game.runs` (and optionally the
  `vxtpl.game.runs_per_day` limit key) - liaison letter 130.
- The reference build now demonstrates a daily-quota pattern (count locally
  against your own domain table, platform limits win when present) that no
  contract schema could show.
- Scores are client-reported within server bounds (see the spec's integrity
  posture); a replay-verified leaderboard is the known upgrade if the board
  ever carries stakes.

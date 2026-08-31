# The 20-Second Challenge - game and subscription specification

vxtpl's business domain (ADR-006): a 20-second bullet-dodging challenge whose
three subscription tiers exercise the platform's quota / subscription /
entitlement machinery with real users. Derived from the owner's product design
document ("20-Second Challenge SaaS subscription product design", 2026-08);
this file is the executable-English version the code implements. Pricing is
deliberately absent: prices live in the platform console, never in the product.

## The game

A minimalist reaction challenge. The player steers a dot; bullets stream in
from every edge, aimed with jitter; surviving the full 20 seconds is a win, and
the score is the survival time either way.

| Dimension | Rule |
|-----------|------|
| Core loop | real-time dodging, elimination on first hit, scored by survival time |
| Run length | 20.000 seconds, fixed (`RUN_DURATION_MS`) |
| Skill model | dodging craft, not reflexes (owner decision 2026-08-31): everything is SLOW and AIMED. Bullets fire exactly at the player's position and fly straight (no jitter, no homing), so standing still is lethal and any deliberate move invalidates every shot in the air. The ramp raises density (spawn cadence 320ms -> 70ms), barely speed (60 -> 130 logical px/s); slow bullets live longer, so the field thickens on its own. Four converging ring bursts at 6.0 / 11.0 / 15.5 / 18.2s |
| Player | fixed 150 px/s - slightly faster than the fastest bullet, so every death is a positioning mistake, never a speed check. Small marks throughout (player r4, bullets r2-3.2): the read is lanes, not blobs |
| Controls | the four arrow keys, nothing else (owner decision 2026-08-31; desktop-first, no pointer follow, no touch) |
| Presentation | a fullscreen command deck in the owner's reference style (amber-on-charcoal data-viz dashboard): fixed overlay, gold panel chrome, the glowing center orb as start control and score display |
| Determinism | every run is seeded server-side; the engine (`game/engine.ts`) is pure and replayable from the seed |
| Cross-device | one logical 800x520 arena, letterboxed into the viewport - a smaller screen shrinks the picture, not the game |

## The tier ladder

Three effective steps over the same game, each unlocking exactly one thing.
Tiers are cumulative (platform capability-matrix mechanism); business and
enterprise add nothing on the game axis beyond pro.

| Tier | Adds | Capability keys |
|------|------|-----------------|
| free | play, 10 runs/day | `game:play` |
| starter | unlimited runs + personal record (last 10 runs, best 3 pinned, with time and date) | `game:unlimited-runs`, `game:history` |
| pro | global leaderboard + record window widened to 30 days with a daily-best trend curve | `game:leaderboard`, `game:trend` |

## Quota (free tier)

- A run is spent when it STARTS (`POST /api/game/run` inserts the row before
  the first bullet), so abandoning a run mid-air does not refund it.
- The day boundary is 00:00 UTC, stated in the UI.
- The cap is 10 by product default (`FREE_DAILY_RUNS`); a platform-configured
  `limits["vxtpl.game.runs_per_day"]` in the C2 envelope overrides it. Tiers
  holding `game:unlimited-runs` ignore both.
- Exhausted quota answers 429 with the reset time and the tier that removes the
  limit; the surface renders that as the offer, not as an error.

## Records and display rules

- Fields per run: time and date played (`started_at`), score (survival ms),
  outcome (survived / hit).
- Best 3 pinned: the all-time top three finished runs stay pinned on the
  records surface at every entitled tier - the window widens with the ladder,
  the podium never forgets.
- Starter window: last 10 finished runs. Pro window: last 30 days (list capped
  at 100 rows for reading; the trend aggregates every run in the window).
- Trend (pro): per-UTC-day best/mean/count over the 30-day window, drawn as a
  single daily-best curve. Days without runs are gaps, not zeros.
- Leaderboard (pro): each player's single best finished run, global across
  workspaces, ties broken by who set the time first. Players appear as
  deterministic anonymous call signs derived from `sub` (`NOVA-7F3A`) - the one
  cross-workspace surface carries no identifier that maps back to an account.

## Integrity posture

The client is the only witness to the bullets, so scores are client-reported -
bounded, not trusted:

1. finish requires the caller's own `started` run (404 otherwise, identically
   for missing and foreign runs);
2. a run finishes once (409 on replay);
3. the score must fit the run duration (0..20000 integer) AND the wall clock
   the server observed between start and finish, plus 3s slack (422 otherwise).

That is proportionate for an arcade board. A determined forger can still craft
a plausible score by waiting; a replay-verified board (the seed makes runs
replayable) is the known upgrade path if it ever matters.

## Scope boundary

Goals: verify the SaaS subscription machinery (quota / paid tiers / permission
ladder) with a product people actually use; provide the fun.

Non-goals, carried over from the design doc verbatim: no friend/social graph,
no ads, no seasons, no battle pass, no skins, no revenue intent. And one of
this repo's own: no client anti-cheat arms race (see integrity posture).

## Implementation map

| Piece | Where |
|-------|-------|
| Rules (pure) | `portals/app/app/game/rules.ts` |
| Engine (pure, seeded) | `portals/app/app/game/engine.ts` |
| Persistence port | `portals/app/app/game/store.ts` (+ `prisma-store.ts`) |
| Schema | `deploy/database/ddl/incr/0001_vxtpl_game.sql` (`vxtpl_game.run`) |
| APIs | `portals/app/app/api/game/{,run,run/finish,records,leaderboard}/route.ts` |
| Surfaces | `/challenge`, `/records`, `/leaderboard` under `portals/app/app/(product)/` |
| Tier keys | `portals/app/app/entitlement/capability.ts` (`game:*`) |
| Usage metric | `vxtpl.game.runs`, buffered like `vxtpl.chat.messages` (liaison letter 130) |

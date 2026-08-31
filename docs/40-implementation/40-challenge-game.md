# 40 - The challenge game: how the module fits together

Companion to the spec (`docs/20-specs/20-challenge-game.md`). This is the
maintainer's map: where each responsibility lives and the three design rules
that keep the module copyable.

## Layering

```
(product)/page.tsx               THE app: the deck at `/` - phase machine, rails, quota, CTAs
(product)/deck/game-view.tsx     renderer: arrow-key input, canvas, countdown ONLY
(product)/deck/panels.tsx        side modules: record, board, avatar menu (self-fetching)
(product)/deck/trend-chart.tsx   the daily-best curve (deck-grounded via .deck token override)
(product)/challenge/page.tsx     redirect to `/` (old links only)
game/engine.ts                   pure sim: seeded RNG, spawn curves, collision
game/rules.ts                    pure product rules: quota, windows, trend, call signs
game/store.ts / prisma-store.ts  persistence port: in-memory | vxtpl_game.run
game/api-caller.ts               session -> (workspaceId, sub), chat-route posture
api/game/*                       gate -> count -> write -> meter, per route
```

The deck is the only player surface (owner decision 2026-08-31): records and
board are collapsible rail modules that fetch their own API on first open and
refetch when the page bumps `epoch` after a finished run. The collapse
pattern is the reference design's ARC ornaments made into the control: two
thin bracket arcs embrace the stage when open and mirror outward when folded
(the shape says which way it will move), a rail folds to zero width, and the
KEY information - the two live numbers left, the quiet identity strip right -
lives in the topbar and never folds. Starting a run auto-folds both rails;
the result auto-unfolds them.

Three rules, in copy-priority order:

1. **The engine never touches the DOM and the renderer never decides.** Every
   gameplay number (curves, burst times, speeds, arena size) lives in
   `engine.ts` where node:test can reach it; `game-view.tsx` owns the
   arrow-key input and the canvas, and reports one `{scoreMs, outcome}`
   upward. Input is the four arrow keys ONLY (owner decision 2026-08-31 -
   the old pointer-chase made speed the skill; fixed-speed keys make
   positioning the skill). A copy that swaps the game swaps the engine and
   keeps the surface wiring.
2. **Rules are functions over the C2 envelope.** `dailyRunCap`,
   `historyWindowFor`, `remainingRuns` take an `Entitlement` and return plain
   values; routes render the server's answer and the client re-derives
   nothing. The platform limit (`limits["vxtpl.game.runs_per_day"]`) beats the
   product default by construction (`limitOf(...) ?? FREE_DAILY_RUNS`).
3. **Quota is spent at start, not finish.** `POST /api/game/run` inserts the
   row (and meters `vxtpl.game.runs`) before the countdown begins, so a closed
   tab still spends the attempt - the design doc counts challenges, not
   completions. `countStartedSince` therefore counts rows of ANY status.

## Things that bit us (so a copy does not rediscover them)

- **In-memory stores must live on `globalThis`.** Next bundles each API route
  separately; a module-scoped singleton gives `/api/game/run` and
  `/run/finish` different Maps, and the second route answers "run not found"
  for a run the first just created. Observed in dev; `game/store.ts` documents
  the fix. The Prisma path is immune (state is in the database).
- **`Button asChild` + a bare `a { color }` rule = accent-on-accent.**
  Tailwind utilities sit in a cascade layer, and any unlayered element rule
  beats them. `globals.css` scopes a `revert-layer` on
  `a[data-slot="button"]`; do not remove it when restyling links.
- **The frame clamp is a fairness feature.** `game-view` clamps a frame's dt
  to 50ms, so a background tab's rAF starvation slows the game instead of
  fast-forwarding bullets through the player. Server-side,
  `scoreFitsWallClock` is one-sided (score <= wall + slack) - a slowed run
  stays valid, an inflated one does not.
- **The leaderboard crosses workspaces on purpose, so it must carry nothing
  else.** Subs and workspace ids stay server-side; the API ships derived call
  signs and computes `you` itself. Adding a display name here would be the
  privacy regression, not a feature.

## Verification map

| Concern | Where verified |
|---------|----------------|
| tier ladder / capability keys | `entitlement/capability.test.ts` |
| quota arithmetic, windows, wall-clock rule, call signs, trend | `game/rules.test.ts` |
| store semantics (quota counting, podium, board dedupe) | `game/store.test.ts` |
| determinism, difficulty ramp, collision, tunneling clamp | `game/engine.test.ts` |
| DDL <-> prisma lockstep incl. `vxtpl_game` | `check-data-architecture.mjs` (baseline UNION incr) |
| live API flow (429 at 11th run, 409 replay, 422 overclaim, locked shapes) | exercised against `pnpm dev` with `MOCK_TIER=free|pro` |

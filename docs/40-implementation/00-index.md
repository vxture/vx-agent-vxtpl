# 40-implementation - Package guides, coding rules, dev setup

Layer/package guides, coding conventions, and local dev setup for this repo.

| Doc | Covers |
|-----|--------|
| [10-app-workspace.md](10-app-workspace.md) | the pnpm workspace layout, `@vxtpl/*` packages, local dev, and how the integration modules fit together |
| [20-creating-a-product-from-vxtpl.md](20-creating-a-product-from-vxtpl.md) | copying this repo into a new product: the rename script, the name cascade, and what a human still owns |
| [30-product-front-door.md](30-product-front-door.md) | the access gate every product reuses: verify on entry, one-call resolution, and why the middleware is deliberately dumb |
| [40-challenge-game.md](40-challenge-game.md) | the game module's layering (engine / rules / store / surfaces), the three copy rules, and the traps already paid for |

Each workspace package carries a thin `AGENTS.md` at its root pointing back here;
the substantive guidance lives in this decade under `NN-slug.md`.

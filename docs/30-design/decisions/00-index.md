# ADR register (architecture decision records)

Append-only log of architecture decisions for this repo. Each ADR is a file named
`ADR-NNN-slug.md` with a stable, never-reused, never-renumbered ID (taxonomy
meta-rule section 4). New decisions append; IDs may skip.

A product repo copied from vxtpl starts a fresh register at ADR-001 - these are
vxtpl's decisions, not inherited ones.

| ID | Title | Status | Date |
|----|-------|--------|------|
| [ADR-001](ADR-001-product-grade-exemplar.md) | vxtpl is a deployed product, not a placeholder skeleton | accepted | 2026-08-16 |
| [ADR-002](ADR-002-prod-only-deployment.md) | vxtpl deploys production only | accepted | 2026-08-16 |
| [ADR-003](ADR-003-s2s-token-exchange.md) | S2S tokens are minted per call, never configured | accepted | 2026-08-16 |

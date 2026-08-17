# 00-meta - Documentation map

Top-level index for this repository's `docs/`. The tree follows the org docs
taxonomy (`070-docs-taxonomy.md`): ten decade-numbered top directories,
`00-index.md` in every directory, `NN-slug.md` files with 10-step gaps, and the
strict domain family `{kind}_{domain}_{NNN}_{slug}` for design/schema documents.
Numbered = formal (permanent); unnumbered = temporary (number it or delete it).
The `lint:docs-numbering --strict` guardrail enforces this on every push.

| Decade | Directory | Holds |
|--------|-----------|-------|
| `00-meta` | this directory | the docs map and meta-notes about the docs themselves |
| `10-standards` | `10-standards/` | thin index pointing at the org standards (text lives in the platform repo, not copied here) |
| `20-specs` | `20-specs/` | product/business specifications - vxtpl's product definition |
| `30-design` | `30-design/` | architecture, ADRs, domain design, DB schema |
| `40-implementation` | `40-implementation/` | package/layer guides, coding rules, dev setup |
| `50-deployment` | `50-deployment/` | infra, CI/CD, environments, bootstrap checklists, the branch-protection ruleset |
| `60-operations` | `60-operations/` | runbooks, audits, the tech-debt register (`TD-NNN`), incidents |
| `70-workplan` | `70-workplan/` | build plan and batch tracker |
| `80-liaison` | `80-liaison/` | cross-org liaison (reply letters, integration agreements) |
| `90-memory` | `90-memory/` | in-repo AI handoff (`10-agent.md`) |

## Authority

This repo IS `vxture-vxtpl` - the deployed product other product repos are copied
from. The governing standards are NOT copied here; they live in the platform repo
(`D:\MyWebSite\vxture`):

- `docs/10-standards/140-repo-governance-standard.md` - governance base (WHAT)
- `docs/10-standards/070-docs-taxonomy.md` - docs numbering
- `docs/30-design/product_240_repo-template.md` - product-repo design
- `docs/50-deployment/rebuild/20-self-rectify-runbook.md` - runbook (HOW + checks)

A gap not covered by those standards is fixed in the platform repo first and
mirrored here - never invented in a product repo, including this one.

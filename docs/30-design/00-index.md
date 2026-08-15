# 30-design - Architecture, ADRs, domain design, DB schema

Design documents for this repo: architecture, architecture decision records
(`decisions/`), domain design, and database schema docs.

vxtpl's domain is the platform integration surface itself, so its business-face
database is the three contract schemas (`vx_provision` / `local_authz` /
`local_usage`) and nothing more - those names are reserved org-wide and a product
copied from vxtpl must not reuse them for its own domain data.

Domain documents use the strict org underscore family
`{kind}_{domain}_{NNN}_{slug}` (kind in data/design/ops), enabled once a product's
domain code is registered in the taxonomy domain-code table
(`070-docs-taxonomy.md` section 5).

## Subdirectories

- `decisions/` - architecture decision records (`ADR-NNN`, append-only, stable IDs)

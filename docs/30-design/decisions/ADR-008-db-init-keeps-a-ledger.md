# ADR-008: db-init keeps a ledger - each DDL file applies once

- **Status:** accepted
- **Date:** 2026-09-10 (owner, in yucer: 用增量账本方案; then 把 db-init 账本同步回模版)
- **Amends:** the db-init design of batch E - "re-apply 00 / 97 / 98 and every
  increment on every run" - and its 2026-09-01 repair, which shipped the
  pinned commit's DDL but still replayed all of it.

## Context

db-init re-applied the whole DDL set on every run and trusted each file to be a
no-op on a database that already had it. A product built from this template
(yucer) proved that trust misplaced the first time its production database was
re-initialised (2026-09-10): the baseline re-created a table an increment had
renamed, the column locks granted on a column an increment had dropped, and an
early increment would have done the same on a column a later one removed. An
increment is written against the schema AS IT WAS when the increment was new;
replaying it later is replaying it against a different schema. CI applies the
set once on a fresh database and had never replayed it; the property production
depended on was the one nothing tested.

vxtpl itself has three increments and has not hit this - yet. Every product
copied from here will, the day an increment renames or drops something.

## Decision

db-init keeps a ledger, `vxtpl_meta.applied_ddl` (`deploy/database/ddl/ledger.sql`),
one row per file: `baseline` for the 00 / 97 / 98 trio and the file name for
each increment. A file is applied only if it is not in the ledger, and recorded
when it is. The trio runs on a fresh database only.

A database that predates the ledger (nothing recorded, yet the baseline is
there) is not guessed at: db-init refuses unless the operator passes
`bootstrap_through=NNNN`, then records the trio and every increment up to that
number as applied - once - and carries on from there. vxtpl's own production
database is bootstrapped through 0003 on the first run after this ADR.

The remote half of db-init is a file in the repo (`deploy/db-init-remote.sh`)
rather than a heredoc in the workflow, so it can be rehearsed against a local
database with `DB_URL=...`. The pinned commit's `database/ddl` is rsync'd to
`<STACK_ROOT>/db-init/<sha>/` and applied from there - the 2026-09-01 rule
(the DDL travels with the run, counted on both sides) stays, in a directory of
its own that the running stack's `deploy/` never sees.

## What stays true

- `db-init` is still the sole structure-change path; the ledger is its
  bookkeeping, not a product table - outside 00 / 97 / 98 / incr, no service-role
  grant, no domain reads it.
- The DDL carries vxtpl's literal names and is applied verbatim; `rename-product`
  rewrites `vxtpl_meta` like everything else.
- Increments are still append-only and still written idempotently for a fresh
  database. What changes is that an increment is no longer expected to be a
  no-op against a schema newer than itself.
- The increment count is still checked on both sides (2026-09-01): a tree that
  arrives short fails.

## What this does NOT do

- No per-file checksum: a recorded file that is later edited is not re-run and
  not flagged. Editing an applied increment is already forbidden.
- No down-migrations. Rolling a structure change back is a new increment.

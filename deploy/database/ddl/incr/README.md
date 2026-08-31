# incr - numbered DDL increments

Structure changes to a live database ship here as idempotent, numbered SQL
increments (`0001_slug.sql`, `0002_slug.sql`, ...) applied by the db-init
workflow - never by editing `00_baseline.sql` (which is create-once) and never by
the container entrypoint.

Each increment must be idempotent: `ADD COLUMN IF NOT EXISTS`,
`CREATE TABLE IF NOT EXISTS`, etc. Adding a writable column also requires updating
`../98_column_locks.sql`, or the service-role write fails with permission denied.

A domain-schema increment is SELF-CONTAINED: it creates the schema, then grants
the service role and locks columns itself (`0001_vxtpl_game.sql` is the worked
example). Do not put a domain schema's grants in `97_service_role.sql` /
`98_column_locks.sql` - those apply BEFORE incr/, so on a fresh database they
would name a schema that does not exist yet.

The contract tables all live in `00_baseline.sql`; vxtpl's own domain schema
(`vxtpl_game`, ADR-006) starts the increments. A product copied from vxtpl
replaces the domain increments with its own (rename-product rewrites the schema
name; the domain itself is exemplar content).

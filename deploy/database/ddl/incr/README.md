# incr - numbered DDL increments

Structure changes to a live database ship here as idempotent, numbered SQL
increments (`0001_slug.sql`, `0002_slug.sql`, ...) applied by the db-init
workflow - never by editing `00_baseline.sql` (which is create-once) and never by
the container entrypoint.

Each increment must be idempotent: `ADD COLUMN IF NOT EXISTS`,
`CREATE TABLE IF NOT EXISTS`, etc. Adding a writable column also requires updating
`../98_column_locks.sql`, or the service-role write fails with permission denied.

Empty at the vxtpl baseline: every table vxtpl uses is in `00_baseline.sql`. A
product copied from vxtpl inherits that baseline and adds its own increments here.

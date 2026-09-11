-- ledger.sql - which DDL files this database has had applied (ADR-008).
--
-- NOT PART OF THE PRODUCT SCHEMA. This is db-init's own bookkeeping, applied
-- by db-init before anything else, on every run, and read only by db-init;
-- the service role gets nothing on it and no domain reads it. It lives
-- outside 00 / 97 / 98 / incr on purpose: the guardrails that read those
-- files are about product tables, and this is neither a product table nor a
-- locked one.
--
-- WHY IT EXISTS. db-init used to re-apply the whole set - baseline, roles,
-- locks, every increment - on every run, trusting each file to be a no-op
-- on a database that already had it. A product built from this template
-- (yucer, 2026-09-10) proved that trust misplaced on its second production
-- run: the baseline re-created a table an increment had renamed, the locks
-- granted on a column an increment had dropped, and an early increment
-- would have done the same. An increment is written against the schema AS
-- IT WAS when the increment was new; replaying it later is replaying it
-- against a different schema. So each file is applied ONCE, and this table
-- remembers which.
--
-- One row per file: 'baseline' for the 00 / 97 / 98 trio (applied together,
-- on a fresh database only), and the increment's file name without .sql for
-- each increment. `applied_by` is 'db-init' when the file was run,
-- 'bootstrap' when an operator declared it already applied (the one-time
-- migration of a database that predates this ledger).
--
-- Idempotent.
CREATE SCHEMA IF NOT EXISTS vxtpl_meta;
CREATE TABLE IF NOT EXISTS vxtpl_meta.applied_ddl (
  name        TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by  TEXT NOT NULL DEFAULT 'db-init',
  git_sha     TEXT
);

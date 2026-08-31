-- 0001_vxtpl_game.sql - the challenge-game domain schema (ADR-006).
--
-- vxtpl's first domain schema: one append-mostly table recording every
-- challenge run. Naming follows data_platform_100 section 3.2 (uuid PK via
-- gen_random_uuid(), TIMESTAMPTZ, status VARCHAR(32)+CHECK, idx_/uidx_/chk_
-- prefixes). workspace_id / sub are platform REFERENCE keys, never
-- product-declared.
--
-- Grants and column locks for this schema live HERE rather than in
-- 97_service_role.sql / 98_column_locks.sql: apply.sh runs 97/98 before incr/,
-- so on a fresh database a grant in 97 would name a schema that does not exist
-- yet. A domain increment is self-contained - create, grant, lock, in order.

CREATE SCHEMA IF NOT EXISTS vxtpl_game;

-- One row per challenge run. Two-phase: INSERT at start (status 'started' -
-- this is the row the daily quota counts, so abandoning a run mid-air still
-- spends it), UPDATE at finish with the outcome. score_ms is survival time in
-- milliseconds, capped at the 20s run length.
CREATE TABLE IF NOT EXISTS vxtpl_game.run (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref] isolation key
  sub           VARCHAR(128) NOT NULL,                -- [ref] full "usr_<uuid>"
  status        VARCHAR(32) NOT NULL DEFAULT 'started'
                  CONSTRAINT chk_run_status CHECK (status IN ('started', 'finished')),
  outcome       VARCHAR(32)
                  CONSTRAINT chk_run_outcome CHECK (outcome IN ('survived', 'hit')),
  score_ms      INTEGER
                  CONSTRAINT chk_run_score_ms CHECK (score_ms >= 0 AND score_ms <= 20000),
  seed          VARCHAR(64) NOT NULL,                 -- server-issued spawn seed
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily quota count + personal history both scan by player and recency.
CREATE INDEX IF NOT EXISTS idx_run_ws_sub_started
  ON vxtpl_game.run (workspace_id, sub, started_at DESC);

-- Global leaderboard: best finished scores first.
CREATE INDEX IF NOT EXISTS idx_run_finished_score
  ON vxtpl_game.run (score_ms DESC, finished_at ASC)
  WHERE status = 'finished';

-- Service-role access (mirrors 97_service_role.sql for the contract schemas).
GRANT USAGE ON SCHEMA vxtpl_game TO vxtpl_svc;
GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA vxtpl_game TO vxtpl_svc;

-- Column locks (mirrors 98_column_locks.sql): only the finish-phase columns are
-- writable. Anchor columns (id, workspace_id, sub, seed, started_at,
-- created_at) are immutable once the run row exists.
REVOKE UPDATE ON vxtpl_game.run FROM vxtpl_svc;
GRANT UPDATE (status, outcome, score_ms, finished_at)
  ON vxtpl_game.run TO vxtpl_svc;

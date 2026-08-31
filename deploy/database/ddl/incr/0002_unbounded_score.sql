-- 0002_unbounded_score.sql - 20s is the qualifying bar, not the end.
--
-- The baseline increment (0001) capped score_ms at the old fixed run length
-- (20000). Runs are now unbounded above (owner decision 2026-08-31): the
-- score is however long you survive, and 20s only marks a qualified run. The
-- column keeps a sanity ceiling matching rules.ts MAX_SCORE_MS (10 minutes) -
-- the finish route's wall-clock check bounds honest scores well below it.
--
-- Idempotent as a pair: every db-init apply drops and re-adds the constraint.

ALTER TABLE vxtpl_game.run DROP CONSTRAINT IF EXISTS chk_run_score_ms;
ALTER TABLE vxtpl_game.run ADD CONSTRAINT chk_run_score_ms
  CHECK (score_ms >= 0 AND score_ms <= 600000);

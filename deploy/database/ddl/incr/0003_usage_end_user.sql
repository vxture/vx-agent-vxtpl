-- 0003_usage_end_user.sql - optional per-user attribution on buffered usage.
--
-- The consume contract (integration general rules, C3 up) accepts an optional
-- end_user_id for end-user attribution. vxtpl's units of work are personal
-- (a challenge run, a chat message), so the buffer carries the sub and the
-- flush forwards it. [ref] platform-issued sub, full "usr_<uuid>"; nullable -
-- rows recorded before this column, or without a user context, stay valid.
--
-- No column-lock change: local_usage.raw grants UPDATE (flushed) only, and
-- end_user_id is written at INSERT and never mutated.

ALTER TABLE local_usage.raw ADD COLUMN IF NOT EXISTS end_user_id VARCHAR(128);

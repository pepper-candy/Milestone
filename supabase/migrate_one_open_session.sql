-- One open (ended_at IS NULL) session per credit owner (child user_id).
-- Run in Supabase SQL Editor after migrate_parent_child_attribution.sql.
--
-- If CREATE INDEX fails with a uniqueness error, close orphans first, e.g.:
--
--   -- Keep newest open row per user_id; end the rest
--   WITH ranked AS (
--     SELECT id,
--            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY started_at DESC) AS rn
--     FROM sessions
--     WHERE ended_at IS NULL
--   )
--   UPDATE sessions s
--   SET ended_at = now(),
--       duration_seconds = GREATEST(
--         0,
--         EXTRACT(EPOCH FROM (now() - s.started_at))::int
--       )
--   FROM ranked r
--   WHERE s.id = r.id AND r.rn > 1;
--
-- Then re-run the CREATE UNIQUE INDEX below.

CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_open_per_user
  ON sessions (user_id)
  WHERE ended_at IS NULL;

COMMENT ON INDEX sessions_one_open_per_user IS
  'At most one live session per child credit row (user_id)';

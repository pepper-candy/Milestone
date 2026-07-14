-- Fix: treat session times as UTC (avoids HKT +8h false elapsed on clients).
-- Safe to run on existing Supabase projects.

ALTER TABLE sessions
  ALTER COLUMN started_at TYPE TIMESTAMPTZ
  USING started_at AT TIME ZONE 'UTC';

ALTER TABLE sessions
  ALTER COLUMN ended_at TYPE TIMESTAMPTZ
  USING ended_at AT TIME ZONE 'UTC';

ALTER TABLE sessions
  ALTER COLUMN paused_at TYPE TIMESTAMPTZ
  USING paused_at AT TIME ZONE 'UTC';

-- Clear accidental paused state from the old click-to-pause UI
UPDATE sessions
SET is_paused = false,
    paused_at = null
WHERE ended_at IS NULL AND is_paused = true;

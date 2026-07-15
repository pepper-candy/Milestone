-- Reset progress: uncheck all tasks + delete all sessions (working + tutorial).
-- Run in Supabase SQL Editor. DESTRUCTIVE — review before execute.
--
-- Optional: scope to one child by invitation code (uncomment the WHERE clauses).

BEGIN;

-- 1) All user_tasks → available (unchecked)
UPDATE user_tasks
SET
  status = 'available',
  completed_at = NULL,
  proof_data = NULL,
  marked_by_user_id = NULL,
  marked_by_nickname = NULL;
-- Optional one-child scope:
-- WHERE user_id IN (
--   SELECT id FROM profiles WHERE invitation_code = 'CHILD-XXXX'
-- );

-- 2) Remove every session (working + tutorial, open or finished)
DELETE FROM sessions;
-- Optional one-child scope (also covers parent-conducted sessions credited to that child):
-- WHERE user_id IN (
--   SELECT id FROM profiles WHERE invitation_code = 'CHILD-XXXX'
-- )
-- OR conducted_by_user_id IN (
--   SELECT id FROM profiles WHERE invitation_code = 'PARENT-XXXX'
-- );

-- Sanity check (should show 0 non-available tasks, 0 sessions)
SELECT status, COUNT(*) AS n FROM user_tasks GROUP BY status ORDER BY status;
SELECT COUNT(*) AS session_rows FROM sessions;

COMMIT;
-- If anything looks wrong: ROLLBACK; (only if you have not committed yet)

-- Diagnose + fix: new mentees preloaded / looking "already checked"
-- Root cause: old backfill seeded user_tasks as status = 'pending'
-- (pending = submitted for mentor review → PASS/CHECK look + no edit).
-- Run in Supabase SQL Editor.

-- 1) Status breakdown (expect lots of 'pending' if this is the bug)
SELECT ut.status, COUNT(*) AS n
FROM user_tasks ut
JOIN profiles p ON p.id = ut.user_id
WHERE p.is_child = true
GROUP BY ut.status
ORDER BY ut.status;

-- 2a) Prefer blank lists (new mentor product rule): wipe assignments
-- DELETE FROM user_tasks
-- WHERE user_id IN (SELECT id FROM profiles WHERE is_child = true);

-- 2b) Or keep assignments but uncheck them:
UPDATE user_tasks
SET
  status = 'available',
  completed_at = NULL,
  proof_data = NULL,
  marked_by_user_id = NULL,
  marked_by_nickname = NULL
WHERE status IN ('pending', 'verified', 'claimed')
  AND user_id IN (SELECT id FROM profiles WHERE is_child = true);

-- 3) Check for leftover assign-on-signup triggers (should be empty / unrelated)
SELECT tgname, relname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal
  AND relname IN ('profiles', 'user_tasks', 'tasks', 'users');

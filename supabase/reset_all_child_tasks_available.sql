-- One-time testing reset: all mentee tasks → available (unchecked).
-- Run in Supabase SQL Editor. Safe to re-run.
-- Does not delete sessions; only clears task progress on child accounts.

UPDATE user_tasks
SET
  status = 'available',
  completed_at = NULL,
  proof_data = NULL,
  marked_by_user_id = NULL,
  marked_by_nickname = NULL
WHERE user_id IN (
  SELECT id FROM profiles WHERE is_child = true
);

-- Expect only 'available' for child rows:
SELECT ut.status, COUNT(*) AS n
FROM user_tasks ut
JOIN profiles p ON p.id = ut.user_id
WHERE p.is_child = true
GROUP BY ut.status
ORDER BY ut.status;

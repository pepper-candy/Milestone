-- Optional extended prerequisite list (prereq_1/prereq_2 kept for legacy reads).
-- Run in Supabase SQL Editor.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS prereqs TEXT[];

COMMENT ON COLUMN tasks.prereqs IS
  'Ordered prerequisite task_no list. Unknown codes are ignored for locking.';

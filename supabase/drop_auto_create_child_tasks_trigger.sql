-- Drop the live DB trigger that auto-assigns every catalog task to new mentees.
-- Confirmed via: SELECT tgname, relname FROM pg_trigger ... → trigger_auto_create_child_tasks on profiles
-- This trigger is NOT in the repo; it was created earlier in Supabase and keeps re-seeding
-- on every new child profile insert (Start as Mentor / invite).
-- Run in Supabase SQL Editor.

-- 1) Inspect function body (optional — see what it inserts / which status)
SELECT p.proname, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_trigger t ON t.tgfoid = p.oid
WHERE t.tgname = 'trigger_auto_create_child_tasks';

-- 2) Drop trigger + function
DROP TRIGGER IF EXISTS trigger_auto_create_child_tasks ON profiles;

-- Common function names used with that trigger — drop if present:
DROP FUNCTION IF EXISTS auto_create_child_tasks() CASCADE;
DROP FUNCTION IF EXISTS trigger_auto_create_child_tasks() CASCADE;
DROP FUNCTION IF EXISTS create_child_tasks() CASCADE;
DROP FUNCTION IF EXISTS handle_new_child_tasks() CASCADE;

-- If DROP FUNCTION above missed the real name, use the proname from step 1:
-- DROP FUNCTION IF EXISTS <proname>() CASCADE;

-- 3) Confirm gone (should return 0 rows)
SELECT tgname, relname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal
  AND tgname = 'trigger_auto_create_child_tasks';

-- 4) Clear preloaded assignments so mentees start blank again
DELETE FROM user_tasks
WHERE user_id IN (SELECT id FROM profiles WHERE is_child = true);

-- 5) Verify
SELECT p.invitation_code, COUNT(ut.*) AS assignments
FROM profiles p
LEFT JOIN user_tasks ut ON ut.user_id = p.id
WHERE p.is_child = true
GROUP BY p.id, p.invitation_code
ORDER BY p.invitation_code;

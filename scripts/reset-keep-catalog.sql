-- =============================================================================
-- Milestone: wipe accounts + progress, KEEP shared task catalog
-- Run in: Supabase Dashboard → SQL Editor (as project owner / service role)
--
-- KEEPS
--   • public.tasks WHERE is_catalog_template = true  (shared catalog)
--   • public.milestones (legacy global prize defs, if present — not per-user)
--   • Schema / RLS / policies
--
-- DELETES
--   • All auth users + profiles (mentors / mentees)
--   • user_tasks, sessions, user_milestones, location_proofs, mentee_milestones
--   • tasks that are NOT catalog templates (per-mentee instances)
--
-- AFTER THIS
--   1. Clear Vercel Blob uploads separately (avatars / desk photos).
--   2. App → "Start as a Mentor" → one brand-new parent account.
-- =============================================================================

BEGIN;

-- Optional peek before wipe (uncomment to inspect)
-- SELECT
--   (SELECT count(*) FROM auth.users) AS auth_users,
--   (SELECT count(*) FROM public.profiles) AS profiles,
--   (SELECT count(*) FROM public.tasks WHERE COALESCE(is_catalog_template, false)) AS catalog_tasks,
--   (SELECT count(*) FROM public.tasks WHERE NOT COALESCE(is_catalog_template, false)) AS instance_tasks;

-- 1) Assignment / progress (must go before deleting non-catalog tasks)
DELETE FROM public.user_tasks;

-- 2) Sessions + proofs
DELETE FROM public.sessions;

DO $$
BEGIN
  IF to_regclass('public.location_proofs') IS NOT NULL THEN
    DELETE FROM public.location_proofs;
  END IF;
END $$;

-- 3) Prize-path claims + per-mentee paths
DELETE FROM public.user_milestones;

DO $$
BEGIN
  IF to_regclass('public.mentee_milestones') IS NOT NULL THEN
    DELETE FROM public.mentee_milestones;
  END IF;
END $$;

-- 4) Per-mentee / non-catalog task rows only — KEEP shared catalog
DELETE FROM public.tasks
WHERE COALESCE(is_catalog_template, false) IS NOT TRUE;

-- 5) All profiles (invite codes, links, prize_path_default, gems, etc.)
DELETE FROM public.profiles;

-- 6) Auth users — yes, this can run here in SQL Editor (no manual UI required).
--    Dashboard Auth → Users also works if you prefer clicking.
--    profiles.id REFERENCES auth.users(id) ON DELETE CASCADE, so profiles
--    would cascade if you deleted auth first; we already cleared profiles above.
DELETE FROM auth.users;

COMMIT;

-- Verify: catalog should remain; accounts should be empty
SELECT count(*) AS catalog_tasks_remaining
FROM public.tasks
WHERE COALESCE(is_catalog_template, false) = true;

SELECT count(*) AS instance_tasks_remaining
FROM public.tasks
WHERE COALESCE(is_catalog_template, false) IS NOT TRUE;

SELECT count(*) AS profiles_remaining FROM public.profiles;
SELECT count(*) AS auth_users_remaining FROM auth.users;

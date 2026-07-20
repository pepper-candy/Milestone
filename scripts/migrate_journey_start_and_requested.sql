-- Journey start date (Day 1) + allow user_tasks.status = 'requested'
-- Run in Supabase SQL Editor.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS journey_start_date DATE;

COMMENT ON COLUMN public.profiles.journey_start_date IS
  'HKT calendar date for Day 1 (4am HKT boundary). Null = use created_at logical day.';

-- If status is constrained by a CHECK, extend it. Safe if no check exists.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  JOIN pg_namespace n ON t.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND t.relname = 'user_tasks'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%status%';
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.user_tasks DROP CONSTRAINT %I', con_name);
    ALTER TABLE public.user_tasks
      ADD CONSTRAINT user_tasks_status_check
      CHECK (
        status IN (
          'available',
          'pending',
          'verified',
          'claimed',
          'removed',
          'requested'
        )
      );
  END IF;
END $$;

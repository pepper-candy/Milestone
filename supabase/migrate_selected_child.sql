-- Parent child selector: persist which linked child dashboard shows.
-- Run in Supabase SQL Editor after schema.sql.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS selected_child_code TEXT NULL;

COMMENT ON COLUMN profiles.selected_child_code IS
  'Parent only: invitation_code of the linked child shown on dashboard';

-- Backfill parents: default to first linked child when unset.
UPDATE profiles
SET selected_child_code = linked_children[1]
WHERE is_child = false
  AND selected_child_code IS NULL
  AND linked_children IS NOT NULL
  AND array_length(linked_children, 1) > 0;

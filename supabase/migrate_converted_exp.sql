-- Bank EXP that has been converted into gems (20 EXP = 1 gem, user-initiated).
-- Run in Supabase SQL Editor.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS converted_exp NUMERIC(10,1) NOT NULL DEFAULT 0;

COMMENT ON COLUMN profiles.converted_exp IS
  'EXP already spent into gems via Convert (multiples of 20). Display gems = task gems + converted_exp/20.';

-- Parents may update converted_exp on linked children (convert on mentee dashboard).
DROP POLICY IF EXISTS "Parents update linked child converted_exp" ON profiles;
CREATE POLICY "Parents update linked child converted_exp" ON profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM profiles parent
      WHERE parent.id = auth.uid()
        AND parent.is_child = false
        AND profiles.invitation_code = ANY (parent.linked_children)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles parent
      WHERE parent.id = auth.uid()
        AND parent.is_child = false
        AND profiles.invitation_code = ANY (parent.linked_children)
    )
  );

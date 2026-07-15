-- Parent ↔ child attribution for PASS / tutorial sessions.
-- Run in Supabase SQL Editor after schema.sql.
-- Parents only view/credit linked children; records stay on the child.

-- Trace who marked a child task finished (parent PASS / undo clears)
ALTER TABLE user_tasks
  ADD COLUMN IF NOT EXISTS marked_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marked_by_nickname TEXT;

-- Parent-run sessions credit the child, but record who conducted them
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS conducted_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conductor_nickname TEXT;

COMMENT ON COLUMN user_tasks.marked_by_user_id IS 'Parent (or actor) who marked this child task finished';
COMMENT ON COLUMN user_tasks.marked_by_nickname IS 'Display nickname of the actor at mark time';
COMMENT ON COLUMN sessions.conducted_by_user_id IS 'Parent who ran the session when user_id is the child';
COMMENT ON COLUMN sessions.conductor_nickname IS 'Parent nickname at session start';

-- Parents may read / write sessions for linked children (by invitation code)
DROP POLICY IF EXISTS "Parents read linked child sessions" ON sessions;
CREATE POLICY "Parents read linked child sessions" ON sessions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM profiles parent
      JOIN profiles child ON child.id = sessions.user_id
      WHERE parent.id = auth.uid()
        AND parent.is_child = false
        AND child.invitation_code = ANY (parent.linked_children)
    )
  );

DROP POLICY IF EXISTS "Parents insert linked child sessions" ON sessions;
CREATE POLICY "Parents insert linked child sessions" ON sessions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles parent
      JOIN profiles child ON child.id = sessions.user_id
      WHERE parent.id = auth.uid()
        AND parent.is_child = false
        AND child.invitation_code = ANY (parent.linked_children)
    )
  );

DROP POLICY IF EXISTS "Parents update linked child sessions" ON sessions;
CREATE POLICY "Parents update linked child sessions" ON sessions
  FOR UPDATE TO authenticated USING (
    auth.uid() = conducted_by_user_id
    OR EXISTS (
      SELECT 1
      FROM profiles parent
      JOIN profiles child ON child.id = sessions.user_id
      WHERE parent.id = auth.uid()
        AND parent.is_child = false
        AND child.invitation_code = ANY (parent.linked_children)
    )
  );

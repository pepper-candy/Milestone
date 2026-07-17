-- Fix: import_template / create → permission denied for table tasks
-- (even with SUPABASE_SERVICE_ROLE_KEY — role still needs table GRANTs)
-- Run in Supabase SQL Editor, then retry Import.

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tasks TO authenticated;
GRANT ALL ON TABLE tasks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_tasks TO authenticated;
GRANT ALL ON TABLE user_tasks TO service_role;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read tasks" ON tasks;
CREATE POLICY "Authenticated read tasks" ON tasks
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Parents manage tasks" ON tasks;
CREATE POLICY "Parents manage tasks" ON tasks
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_child = false)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_child = false)
  );

-- Parents may assign user_tasks to mentees
DROP POLICY IF EXISTS "Parents insert child tasks" ON user_tasks;
CREATE POLICY "Parents insert child tasks" ON user_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_child = false
    )
  );

NOTIFY pgrst, 'reload schema';

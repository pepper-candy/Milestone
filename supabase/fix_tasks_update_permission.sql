-- Fix: POST /api/tasks update → 42501 permission denied for table tasks
-- Run in Supabase SQL Editor, then retry Save.

GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE tasks TO authenticated;

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

NOTIFY pgrst, 'reload schema';

-- Fix: POST /api/tasks update → 42501 permission denied for table tasks
-- Run in Supabase SQL Editor, then retry Save.
-- For Import / create also run fix_tasks_service_role_grants.sql (service_role GRANTs).

GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE tasks TO authenticated;
GRANT ALL ON TABLE tasks TO service_role;

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

-- Run in Supabase SQL Editor (fix permissions + backfill child tasks)
-- Fixes: empty task list / empty milestones / ensureUserTasks failures for parents

-- 1) Table privileges (RLS alone is not enough without GRANT)
GRANT USAGE ON SCHEMA public TO authenticated, anon;

GRANT SELECT ON TABLE tasks TO authenticated;
GRANT SELECT ON TABLE milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE user_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE user_milestones TO authenticated;
GRANT SELECT, INSERT ON TABLE location_proofs TO authenticated;

-- 2) Catalog read policies (must exist or SELECT returns empty / errors)
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

ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read milestones" ON milestones;
CREATE POLICY "Authenticated read milestones" ON milestones
  FOR SELECT TO authenticated USING (true);

-- 3) user_tasks policies
ALTER TABLE user_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own tasks" ON user_tasks;
CREATE POLICY "Users can read own tasks" ON user_tasks
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own tasks" ON user_tasks;
CREATE POLICY "Users can update own tasks" ON user_tasks
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own tasks" ON user_tasks;
CREATE POLICY "Users can insert own tasks" ON user_tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Parents read child tasks" ON user_tasks;
CREATE POLICY "Parents read child tasks" ON user_tasks
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_child = false)
  );

DROP POLICY IF EXISTS "Parents update child tasks" ON user_tasks;
CREATE POLICY "Parents update child tasks" ON user_tasks
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_child = false)
  );

-- 4) Assign every catalog task to every child (safe to re-run)
-- IMPORTANT: always 'available' (unchecked). Never use 'pending' here —
-- pending means "already submitted for mentor review" and makes new mentees
-- look pre-checked. ON CONFLICT DO NOTHING will not overwrite existing rows.
INSERT INTO user_tasks (user_id, task_id, status)
SELECT p.id, t.id, 'available'
FROM profiles p
CROSS JOIN tasks t
WHERE p.is_child = true
ON CONFLICT (user_id, task_id) DO NOTHING;

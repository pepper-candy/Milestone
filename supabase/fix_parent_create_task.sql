-- Allow parents to create/assign tasks for linked mentees.
-- Also required: migrate_mentee_task_instances.sql (drop global task_no unique).
-- Prefer SUPABASE_SERVICE_ROLE_KEY so API assign uses admin write client.

-- Parents may insert user_tasks rows for children (not only their own user_id).
DROP POLICY IF EXISTS "Parents insert child tasks" ON user_tasks;
CREATE POLICY "Parents insert child tasks" ON user_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_child = false
    )
  );

NOTIFY pgrst, 'reload schema';

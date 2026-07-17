-- Parent task save: columns + table grants (run in Supabase SQL Editor)
-- Required for Save in task edit (detail fields, prereqs, catalog flag).

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS icon_key TEXT,
  ADD COLUMN IF NOT EXISTS detail_title TEXT,
  ADD COLUMN IF NOT EXISTS detail_lead TEXT,
  ADD COLUMN IF NOT EXISTS detail_aim TEXT,
  ADD COLUMN IF NOT EXISTS detail_body TEXT,
  ADD COLUMN IF NOT EXISTS is_catalog_template BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS prereqs TEXT[];

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

-- Refresh PostgREST schema cache so new columns are visible to the API.
NOTIFY pgrst, 'reload schema';

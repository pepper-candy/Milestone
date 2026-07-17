-- Per-mentee task instances: same task_no may appear many times (different rows).
-- Catalog templates remain unique by task_no (is_catalog_template = true).

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_no_key;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_catalog_task_no_unique
  ON tasks (lower(task_no))
  WHERE is_catalog_template = true;

NOTIFY pgrst, 'reload schema';

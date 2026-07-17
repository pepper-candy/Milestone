-- Shared catalog template flag: only rows with is_catalog_template = true
-- appear in task-code lookup for other parents to load.
-- CSV / seeded tasks default true; parent first-use saves opt in via API.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS is_catalog_template BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN tasks.is_catalog_template IS
  'When true, task_no is discoverable via catalog lookup. Parent first-use of a new code sets this on pristine save.';

-- Run after any ALTER TABLE that adds/renames columns.
-- Without this, POST /api/tasks may 500 until PostgREST reloads its schema cache.

NOTIFY pgrst, 'reload schema';

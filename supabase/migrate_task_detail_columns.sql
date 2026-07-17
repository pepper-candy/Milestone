-- Parent-editable task detail fields (lv2 copy + icon).
-- Run in Supabase SQL Editor.
-- Last-write-wins on shared catalog rows when a parent Saves.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS icon_key TEXT,
  ADD COLUMN IF NOT EXISTS detail_title TEXT,
  ADD COLUMN IF NOT EXISTS detail_lead TEXT,
  ADD COLUMN IF NOT EXISTS detail_aim TEXT,
  ADD COLUMN IF NOT EXISTS detail_body TEXT;

COMMENT ON COLUMN tasks.icon_key IS
  'Glyph override: target | book | mic | spark | footprints. Null = infer from category.';
COMMENT ON COLUMN tasks.detail_title IS
  'Expanded (lv2) title; null falls back to static task-details.';
COMMENT ON COLUMN tasks.detail_lead IS
  'Expanded lead / compact subtitle override.';
COMMENT ON COLUMN tasks.detail_aim IS
  'Aim paragraph (supports **bold**).';
COMMENT ON COLUMN tasks.detail_body IS
  'Remaining body paragraphs; use newlines between blocks.';

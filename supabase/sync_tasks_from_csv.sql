-- Sync tasks catalog from ref/task_exp.csv
-- Run once in the Supabase SQL Editor.
-- Your UI also falls back to src/lib/task-catalog.ts if prereqs are still null.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS seq INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS prereq_1 TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS prereq_2 TEXT;

-- Update existing rows first (covers already-seeded task_nos)
UPDATE tasks AS t SET
  seq = v.seq,
  category = v.category,
  title = v.title,
  description = v.description,
  exp = v.exp,
  gem = v.gem,
  prereq_1 = v.prereq_1,
  prereq_2 = v.prereq_2,
  requires_proof = v.requires_proof
FROM (VALUES
  (1,  'Math_S2_E2_P1', 'Consolidation', 'Consolidation', 'Reach the cut-off score.', 5, 1, NULL::text, NULL::text, false),
  (2,  'Math_S2_E2_P2', 'Consolidation', 'Consolidation', 'Reach the cut-off score.', 5, 1, NULL, NULL, false),
  (3,  'Math_S3_E1_P1', 'Consolidation', 'Consolidation', 'Reach the cut-off score.', 15, 1, 'Math_S2_E2_P1', 'Math_S2_E2_P2', false),
  (4,  'Math_S3_E1_P2', 'Consolidation', 'Consolidation', 'Reach the cut-off score.', 15, 1, 'Math_S2_E2_P1', 'Math_S2_E2_P2', false),
  (5,  'Math_S3_E2_P1', 'Consolidation', 'Consolidation', 'Reach the cut-off score.', 5, 2, 'Math_S3_E1_P1', 'Math_S3_E1_P2', false),
  (6,  'Math_S3_E2_P2', 'Consolidation', 'Consolidation', 'Reach the cut-off score.', 5, 2, 'Math_S3_E1_P1', 'Math_S3_E1_P2', false),
  (7,  'Math_S4_Q_Ch1', 'Pre-Learning', 'Pre-Learning', 'Reach the cut-off score.', 0, 1, 'Math_S3_E2_P1', 'Math_S3_E2_P2', false),
  (8,  'Math_S4_Q_Ch2', 'Pre-Learning', 'Pre-Learning', 'Reach the cut-off score.', 10, 1, 'Math_S3_E2_P1', 'Math_S3_E2_P2', false),
  (9,  'Math_S4_Q_Ch3', 'Pre-Learning', 'Pre-Learning', 'Reach the cut-off score.', 5, 1, 'Math_S3_E2_P1', 'Math_S3_E2_P2', false),
  (10, 'Math_S4_Q_Ch4', 'Pre-Learning', 'Pre-Learning', 'Reach the cut-off score.', 5, 2, 'Math_S4_Q_Ch2', NULL, false),
  (11, 'Math_S4_E1_P1', 'Pre-Learning', 'Pre-Learning', 'Reach the cut-off score.', 15, 2, 'Math_S4_Q_Ch4', NULL, false),
  (12, 'Math_S4_E1_P2', 'Pre-Learning', 'Pre-Learning', 'Reach the cut-off score.', 15, 2, 'Math_S4_Q_Ch4', NULL, false),
  (13, 'Eng_Writing_A1', 'Writing and Grammar', 'Writing and Grammar', 'Finish Writing Task with 4 steps.', 5, 1, NULL, NULL, false),
  (14, 'Eng_Writing_B2', 'Writing and Grammar', 'Writing and Grammar', 'Finish Writing Task with 4 steps.', 15, 1, NULL, NULL, false),
  (15, 'Eng_Writing_B3', 'Writing and Grammar', 'Writing and Grammar', 'Finish Writing Task with 4 steps.', 5, 1, 'Eng_Writing_B2', NULL, false),
  (16, 'Eng_Vocab_1', 'Vocabulary and Idioms', 'Vocabulary and Idioms', 'Present newly learnt phrases.', 15, 0, NULL, NULL, false),
  (17, 'Eng_Vocab_2', 'Vocabulary and Idioms', 'Vocabulary and Idioms', 'Present newly learnt phrases.', 10, 0, 'Eng_Vocab_1', NULL, false),
  (18, 'Eng_Vocab_3', 'Vocabulary and Idioms', 'Vocabulary and Idioms', 'Present newly learnt phrases.', 5, 0, 'Eng_Vocab_2', NULL, false),
  (19, 'Eng_Speak_1', 'Speaking and Immersion', 'Speaking and Immersion', 'GI followed by an IR.', 10, 0, NULL, NULL, false),
  (20, 'Eng_Speak_2', 'Speaking and Immersion', 'Speaking and Immersion', 'GI followed by an IR.', 5, 0, 'Eng_Speak_1', NULL, false),
  (21, 'Eng_Speak_3', 'Speaking and Immersion', 'Speaking and Immersion', 'GI followed by an IR.', 5, 0, 'Eng_Speak_2', NULL, false),
  (22, 'Soc_Project_1', '社區專題', '社區專題', '完成 5分鐘 的簡短匯報。', 0, 2, NULL, NULL, true),
  (23, 'Soc_Project_2', '社區專題', '社區專題', '完成 5分鐘 的簡短匯報。', 5, 1, 'Soc_Project_1', NULL, true)
) AS v(seq, task_no, category, title, description, exp, gem, prereq_1, prereq_2, requires_proof)
WHERE lower(t.task_no) = lower(v.task_no);

-- Insert any task_nos that do not exist yet
INSERT INTO tasks (seq, task_no, category, title, description, exp, gem, prereq_1, prereq_2, requires_proof)
SELECT v.seq, v.task_no, v.category, v.title, v.description, v.exp, v.gem, v.prereq_1, v.prereq_2, v.requires_proof
FROM (VALUES
  (1,  'Math_S2_E2_P1', 'Consolidation', 'Consolidation', 'Reach the cut-off score.', 5, 1, NULL::text, NULL::text, false),
  (2,  'Math_S2_E2_P2', 'Consolidation', 'Consolidation', 'Reach the cut-off score.', 5, 1, NULL, NULL, false),
  (3,  'Math_S3_E1_P1', 'Consolidation', 'Consolidation', 'Reach the cut-off score.', 15, 1, 'Math_S2_E2_P1', 'Math_S2_E2_P2', false),
  (4,  'Math_S3_E1_P2', 'Consolidation', 'Consolidation', 'Reach the cut-off score.', 15, 1, 'Math_S2_E2_P1', 'Math_S2_E2_P2', false),
  (5,  'Math_S3_E2_P1', 'Consolidation', 'Consolidation', 'Reach the cut-off score.', 5, 2, 'Math_S3_E1_P1', 'Math_S3_E1_P2', false),
  (6,  'Math_S3_E2_P2', 'Consolidation', 'Consolidation', 'Reach the cut-off score.', 5, 2, 'Math_S3_E1_P1', 'Math_S3_E1_P2', false),
  (7,  'Math_S4_Q_Ch1', 'Pre-Learning', 'Pre-Learning', 'Reach the cut-off score.', 0, 1, 'Math_S3_E2_P1', 'Math_S3_E2_P2', false),
  (8,  'Math_S4_Q_Ch2', 'Pre-Learning', 'Pre-Learning', 'Reach the cut-off score.', 10, 1, 'Math_S3_E2_P1', 'Math_S3_E2_P2', false),
  (9,  'Math_S4_Q_Ch3', 'Pre-Learning', 'Pre-Learning', 'Reach the cut-off score.', 5, 1, 'Math_S3_E2_P1', 'Math_S3_E2_P2', false),
  (10, 'Math_S4_Q_Ch4', 'Pre-Learning', 'Pre-Learning', 'Reach the cut-off score.', 5, 2, 'Math_S4_Q_Ch2', NULL, false),
  (11, 'Math_S4_E1_P1', 'Pre-Learning', 'Pre-Learning', 'Reach the cut-off score.', 15, 2, 'Math_S4_Q_Ch4', NULL, false),
  (12, 'Math_S4_E1_P2', 'Pre-Learning', 'Pre-Learning', 'Reach the cut-off score.', 15, 2, 'Math_S4_Q_Ch4', NULL, false),
  (13, 'Eng_Writing_A1', 'Writing and Grammar', 'Writing and Grammar', 'Finish Writing Task with 4 steps.', 5, 1, NULL, NULL, false),
  (14, 'Eng_Writing_B2', 'Writing and Grammar', 'Writing and Grammar', 'Finish Writing Task with 4 steps.', 15, 1, NULL, NULL, false),
  (15, 'Eng_Writing_B3', 'Writing and Grammar', 'Writing and Grammar', 'Finish Writing Task with 4 steps.', 5, 1, 'Eng_Writing_B2', NULL, false),
  (16, 'Eng_Vocab_1', 'Vocabulary and Idioms', 'Vocabulary and Idioms', 'Present newly learnt phrases.', 15, 0, NULL, NULL, false),
  (17, 'Eng_Vocab_2', 'Vocabulary and Idioms', 'Vocabulary and Idioms', 'Present newly learnt phrases.', 10, 0, 'Eng_Vocab_1', NULL, false),
  (18, 'Eng_Vocab_3', 'Vocabulary and Idioms', 'Vocabulary and Idioms', 'Present newly learnt phrases.', 5, 0, 'Eng_Vocab_2', NULL, false),
  (19, 'Eng_Speak_1', 'Speaking and Immersion', 'Speaking and Immersion', 'GI followed by an IR.', 10, 0, NULL, NULL, false),
  (20, 'Eng_Speak_2', 'Speaking and Immersion', 'Speaking and Immersion', 'GI followed by an IR.', 5, 0, 'Eng_Speak_1', NULL, false),
  (21, 'Eng_Speak_3', 'Speaking and Immersion', 'Speaking and Immersion', 'GI followed by an IR.', 5, 0, 'Eng_Speak_2', NULL, false),
  (22, 'Soc_Project_1', '社區專題', '社區專題', '完成 5分鐘 的簡短匯報。', 0, 2, NULL, NULL, true),
  (23, 'Soc_Project_2', '社區專題', '社區專題', '完成 5分鐘 的簡短匯報。', 5, 1, 'Soc_Project_1', NULL, true)
) AS v(seq, task_no, category, title, description, exp, gem, prereq_1, prereq_2, requires_proof)
WHERE NOT EXISTS (
  SELECT 1 FROM tasks t WHERE lower(t.task_no) = lower(v.task_no)
);

-- Sanity check (expect 16 rows with at least one prereq):
-- SELECT count(*) FROM tasks WHERE prereq_1 IS NOT NULL OR prereq_2 IS NOT NULL;

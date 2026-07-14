-- Seed tasks + milestones (run after schema.sql)
-- Tasks from ref/task_exp.csv

INSERT INTO tasks (task_no, category, exp, gem, title, description, requires_proof) VALUES
  ('Math_S2_E2_P1', 'math_s23', 5, 1, 'Math S2 E2 P1', 'Secondary 2 math exercise', false),
  ('Math_S2_E2_P2', 'math_s23', 5, 1, 'Math S2 E2 P2', 'Secondary 2 math exercise', false),
  ('Math_S3_E1_P1', 'math_s23', 15, 1, 'Math S3 E1 P1', 'Secondary 3 math exercise', false),
  ('Math_S3_E1_P2', 'math_s23', 15, 1, 'Math S3 E1 P2', 'Secondary 3 math exercise', false),
  ('Math_S3_E2_P1', 'math_s23', 5, 2, 'Math S3 E2 P1', 'Secondary 3 math exercise', false),
  ('Math_S3_E2_P2', 'math_s23', 5, 2, 'Math S3 E2 P2', 'Secondary 3 math exercise', false),
  ('Math_S4_Q_Ch1', 'math_s4', 0, 1, 'Math S4 Quiz Ch1', 'Secondary 4 quiz chapter 1', false),
  ('Math_S4_Q_Ch2', 'math_s4', 10, 1, 'Math S4 Quiz Ch2', 'Secondary 4 quiz chapter 2', false),
  ('Math_S4_Q_Ch3', 'math_s4', 5, 1, 'Math S4 Quiz Ch3', 'Secondary 4 quiz chapter 3', false),
  ('Math_S4_Q_Ch4', 'math_s4', 5, 2, 'Math S4 Quiz Ch4', 'Secondary 4 quiz chapter 4', false),
  ('Math_S4_E1_P1', 'math_s4', 15, 2, 'Math S4 E1 P1', 'Secondary 4 exam practice', false),
  ('Math_S4_E1_P2', 'math_s4', 15, 2, 'Math S4 E1 P2', 'Secondary 4 exam practice', false),
  ('Eng_Writing_A1', 'eng_writing', 5, 1, 'English Writing A1', 'Writing assignment A1', false),
  ('Eng_Writing_B2', 'eng_writing', 15, 1, 'English Writing B2', 'Writing assignment B2', false),
  ('Eng_Writing_B3', 'eng_writing', 5, 1, 'English Writing B3', 'Writing assignment B3', false),
  ('Eng_Vocab_1', 'eng_vocab', 15, 0, 'English Vocab 1', 'Vocabulary set 1', false),
  ('Eng_Vocab_2', 'eng_vocab', 10, 0, 'English Vocab 2', 'Vocabulary set 2', false),
  ('Eng_Vocab_3', 'eng_vocab', 5, 0, 'English Vocab 3', 'Vocabulary set 3', false),
  ('Eng_Speak_1', 'eng_speaking', 10, 0, 'English Speaking 1', 'Speaking practice 1', false),
  ('Eng_Speak_2', 'eng_speaking', 5, 0, 'English Speaking 2', 'Speaking practice 2', false),
  ('Eng_Speak_3', 'eng_speaking', 5, 0, 'English Speaking 3', 'Speaking practice 3', false),
  ('Soc_Project_1', 'community', 0, 2, 'Community Project 1', 'Requires location + photo proof', true),
  ('Soc_Project_2', 'community', 5, 1, 'Community Project 2', 'Requires location + photo proof', true)
ON CONFLICT (task_no) DO UPDATE SET
  category = EXCLUDED.category,
  exp = EXCLUDED.exp,
  gem = EXCLUDED.gem,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  requires_proof = EXCLUDED.requires_proof;

-- Milestones from ref/accumulative_reward.csv
INSERT INTO milestones (gem_threshold, title, prize_name, prize_description, icon) VALUES
  (15, 'Satisfactory', 'Spotify Premium (1 Months)', '1 month Spotify Premium', '🎵'),
  (21, 'Good', 'Meccha Chemeleon', 'Meccha Chameleon prize', '🦎'),
  (23, 'Great', 'Volleyball Stuff', 'Volleyball gear', '🏐'),
  (24, 'Great+', 'Spotify Premium (3 Months)', '3 months Spotify Premium', '🎧'),
  (26, 'Excellent', 'Cow Angry (牛氣)', '牛氣放題', '🍜'),
  (28, 'Excellent+', 'Apple Pencil', 'Apple Pencil', '✏️'),
  (29, 'Superb', 'Spotify Premium (5 Months)', '5 months Spotify Premium', '🎶'),
  (31, 'Superb+', 'Airpods (Any Model)', 'AirPods any model', '👂'),
  (33, 'Outstanding', 'Spotify Premium (11 Months)', '11 months Spotify Premium', '👑'),
  (40, 'Cap', 'Hidden Bonus', 'Hidden end-of-path bonus', '🏰')
ON CONFLICT (gem_threshold) DO UPDATE SET
  title = EXCLUDED.title,
  prize_name = EXCLUDED.prize_name,
  prize_description = EXCLUDED.prize_description,
  icon = EXCLUDED.icon;

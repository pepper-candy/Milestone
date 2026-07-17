-- MILESTONE schema (run in Supabase SQL Editor)
-- Extends PROJECT_PLAN with session pause + tutorial + location_proofs

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  invitation_code TEXT UNIQUE NOT NULL,
  nickname TEXT,
  avatar_url TEXT,
  is_child BOOLEAN DEFAULT true,
  linked_parents TEXT[] DEFAULT '{}',
  linked_children TEXT[] DEFAULT '{}',
  selected_child_code TEXT,
  converted_exp NUMERIC(10,1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- task_no may repeat across mentee instances; catalog templates are unique
  -- (see migrate_mentee_task_instances.sql).
  task_no TEXT NOT NULL,
  category TEXT NOT NULL,
  exp INTEGER NOT NULL,
  gem INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  description TEXT,
  requires_proof BOOLEAN DEFAULT false,
  -- Catalog order + unlock rules (synced from ref/task_exp.csv)
  seq INTEGER,
  prereq_1 TEXT,
  prereq_2 TEXT,
  -- Parent-editable detail overrides (see migrate_task_detail_columns.sql)
  icon_key TEXT,
  detail_title TEXT,
  detail_lead TEXT,
  detail_aim TEXT,
  detail_body TEXT,
  is_catalog_template BOOLEAN NOT NULL DEFAULT true,
  prereqs TEXT[]
);

-- Shared catalog templates: one row per task_no (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS tasks_catalog_task_no_unique
  ON tasks (lower(task_no))
  WHERE is_catalog_template = true;

CREATE TABLE IF NOT EXISTS user_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'available',
  completed_at TIMESTAMP,
  proof_data JSONB,
  marked_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  marked_by_nickname TEXT,
  UNIQUE(user_id, task_id)
);

-- Timestamps are UTC. Prefer TIMESTAMPTZ so clients always get an offset.
-- Legacy TIMESTAMP without tz must be treated as UTC when parsed in JS.
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  start_photo_url TEXT,
  end_photo_url TEXT,
  start_latitude DECIMAL(10,8),
  start_longitude DECIMAL(11,8),
  end_latitude DECIMAL(10,8),
  end_longitude DECIMAL(11,8),
  exp_earned NUMERIC(10,1) DEFAULT 0,
  is_tutorial BOOLEAN DEFAULT false,
  conducted_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  conductor_nickname TEXT,
  -- Unused legacy columns (pause/resume removed; keep for existing DBs)
  is_paused BOOLEAN DEFAULT false,
  paused_at TIMESTAMPTZ,
  paused_ms INTEGER DEFAULT 0,
  location_consistent BOOLEAN
);

-- At most one live session per credit owner (child). Also in migrate_one_open_session.sql.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_open_per_user
  ON sessions (user_id)
  WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gem_threshold INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  prize_name TEXT,
  prize_description TEXT,
  icon TEXT
);

CREATE TABLE IF NOT EXISTS user_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES milestones(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMP DEFAULT now(),
  claimed BOOLEAN DEFAULT false,
  UNIQUE(user_id, milestone_id)
);

CREATE TABLE IF NOT EXISTS location_proofs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  photo_url TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_proofs ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
-- Parents may read linked children profiles by invitation code match is app-level;
-- allow authenticated read of profiles for linked-child display (narrow via RPC later if needed)
DROP POLICY IF EXISTS "Authenticated can read profiles" ON profiles;
CREATE POLICY "Authenticated can read profiles" ON profiles
  FOR SELECT TO authenticated USING (true);

-- Tasks: readable by all authenticated
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

-- Grants (required in addition to RLS)
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE tasks TO authenticated;
GRANT SELECT ON TABLE milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE user_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE user_milestones TO authenticated;
GRANT SELECT, INSERT ON TABLE location_proofs TO authenticated;

-- User tasks
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
DROP POLICY IF EXISTS "Parents insert child tasks" ON user_tasks;
CREATE POLICY "Parents insert child tasks" ON user_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_child = false)
  );

-- Sessions
DROP POLICY IF EXISTS "Users can read own sessions" ON sessions;
CREATE POLICY "Users can read own sessions" ON sessions
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own sessions" ON sessions;
CREATE POLICY "Users can insert own sessions" ON sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own sessions" ON sessions;
CREATE POLICY "Users can update own sessions" ON sessions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Parents read linked child sessions" ON sessions;
CREATE POLICY "Parents read linked child sessions" ON sessions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM profiles parent
      JOIN profiles child ON child.id = sessions.user_id
      WHERE parent.id = auth.uid()
        AND parent.is_child = false
        AND child.invitation_code = ANY (parent.linked_children)
    )
  );
DROP POLICY IF EXISTS "Parents insert linked child sessions" ON sessions;
CREATE POLICY "Parents insert linked child sessions" ON sessions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles parent
      JOIN profiles child ON child.id = sessions.user_id
      WHERE parent.id = auth.uid()
        AND parent.is_child = false
        AND child.invitation_code = ANY (parent.linked_children)
    )
  );
DROP POLICY IF EXISTS "Parents update linked child sessions" ON sessions;
CREATE POLICY "Parents update linked child sessions" ON sessions
  FOR UPDATE TO authenticated USING (
    auth.uid() = conducted_by_user_id
    OR EXISTS (
      SELECT 1
      FROM profiles parent
      JOIN profiles child ON child.id = sessions.user_id
      WHERE parent.id = auth.uid()
        AND parent.is_child = false
        AND child.invitation_code = ANY (parent.linked_children)
    )
  );

-- Milestones readable
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read milestones" ON milestones;
CREATE POLICY "Authenticated read milestones" ON milestones
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can read own milestones" ON user_milestones;
CREATE POLICY "Users can read own milestones" ON user_milestones
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own milestones" ON user_milestones;
CREATE POLICY "Users can update own milestones" ON user_milestones
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own milestones" ON user_milestones;
CREATE POLICY "Users can insert own milestones" ON user_milestones
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Location proofs
DROP POLICY IF EXISTS "Users manage own proofs" ON location_proofs;
CREATE POLICY "Users manage own proofs" ON location_proofs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================
-- Tejas SQLite Schema
-- =============================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- LOGIN ACCOUNTS (no password — pick a login ID)
CREATE TABLE IF NOT EXISTS app_users (
  login_id    TEXT PRIMARY KEY,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- USER PROFILE (one row per login_id)
CREATE TABLE IF NOT EXISTS user_profile (
  login_id              TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  age                   INTEGER NOT NULL,
  height_cm             INTEGER NOT NULL,
  current_weight_kg     REAL NOT NULL,
  goal_weight_kg        REAL,
  activity_level        TEXT NOT NULL,        -- sedentary|light|moderate|active|very_active
  goal                  TEXT DEFAULT 'cut',   -- cut|bulk|maintain|performance
  diet_style            TEXT DEFAULT 'eggetarian',
  deficit_kcal          INTEGER DEFAULT 400,
  daily_calorie_target  INTEGER NOT NULL,
  daily_protein_g       INTEGER NOT NULL,
  daily_carb_g          INTEGER NOT NULL,
  daily_fat_g           INTEGER NOT NULL,
  daily_water_ml        INTEGER NOT NULL,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- AGENTS
CREATE TABLE IF NOT EXISTS agents (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL,
  color       TEXT NOT NULL,
  domain      TEXT NOT NULL,
  tick_ms     INTEGER NOT NULL,
  sleep_hours INTEGER NOT NULL,
  status      TEXT DEFAULT 'active',
  last_tick   DATETIME,
  last_sleep  DATETIME,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- MEALS
CREATE TABLE IF NOT EXISTS meals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id        TEXT NOT NULL,
  meal_type       TEXT NOT NULL,             -- breakfast|lunch|dinner|snack
  food_name       TEXT NOT NULL,             -- "2 rotis + dal tadka + bhindi sabzi"
  portion_notes   TEXT,                       -- "1 katori dal, medium roti"
  calories        INTEGER NOT NULL,
  protein_g       REAL NOT NULL,
  carbs_g         REAL NOT NULL,
  fat_g           REAL NOT NULL,
  fiber_g         REAL DEFAULT 0,
  source          TEXT NOT NULL,             -- manual|photo|voice
  photo_path      TEXT,                       -- if source=photo
  confidence      REAL DEFAULT 1.0,          -- 0-1 from Gemini vision
  logged_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- WORKOUTS
CREATE TABLE IF NOT EXISTS workouts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id          TEXT NOT NULL,
  workout_type      TEXT NOT NULL,           -- gym|run|cardio|mobility
  workout_name      TEXT,                     -- "Push Day", "5K Easy"
  duration_min      INTEGER,
  calories_burned   INTEGER,
  intensity         TEXT,                     -- low|moderate|high
  rpe               INTEGER,                  -- 1-10 perceived exertion
  notes             TEXT,
  completed_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- EXERCISE SETS (one workout -> many sets)
CREATE TABLE IF NOT EXISTS exercise_sets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id    INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,               -- "Barbell Squat"
  set_number    INTEGER NOT NULL,
  reps          INTEGER,
  weight_kg     REAL,
  distance_km   REAL,                         -- for running
  pace_min_km   REAL,                         -- for running
  notes         TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- WEIGHT LOG
CREATE TABLE IF NOT EXISTS weight_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id      TEXT NOT NULL,
  weight_kg     REAL NOT NULL,
  body_fat_pct  REAL,
  logged_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- WATER LOG
CREATE TABLE IF NOT EXISTS water_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id    TEXT NOT NULL,
  amount_ml   INTEGER NOT NULL,
  logged_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- SLEEP LOG
CREATE TABLE IF NOT EXISTS sleep_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id        TEXT NOT NULL,
  bedtime         DATETIME,
  wake_time       DATETIME,
  duration_hours  REAL,
  quality         INTEGER,                    -- 1-10
  source          TEXT DEFAULT 'manual',      -- manual|wearable
  notes           TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- EPISODES (raw memory)
CREATE TABLE IF NOT EXISTS episodes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id      TEXT NOT NULL,
  agent_id      TEXT NOT NULL REFERENCES agents(id),
  content       TEXT NOT NULL,
  source_table  TEXT,                         -- meals|workouts|weight_log etc
  source_id     INTEGER,                      -- FK into source table
  consolidated  INTEGER DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ENTITIES (long-term knowledge nodes)
CREATE TABLE IF NOT EXISTS entities (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id      TEXT NOT NULL,
  agent_id      TEXT NOT NULL REFERENCES agents(id),
  name          TEXT NOT NULL,                -- "Weekend overeating pattern"
  type          TEXT NOT NULL,                -- pattern|food|exercise|metric|goal
  summary       TEXT NOT NULL,
  confidence    REAL DEFAULT 1.0,
  last_updated  DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- FINDINGS
CREATE TABLE IF NOT EXISTS findings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id      TEXT NOT NULL,
  agent_id      TEXT NOT NULL REFERENCES agents(id),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  severity      TEXT DEFAULT 'medium',        -- low|medium|high
  status        TEXT DEFAULT 'pending',       -- pending|approved|dismissed
  action_taken  TEXT,
  approved_at   DATETIME,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- BRIEFINGS
CREATE TABLE IF NOT EXISTS briefings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id      TEXT NOT NULL,
  briefing_type TEXT NOT NULL,                -- morning|evening|weekly
  content       TEXT NOT NULL,
  finding_ids   TEXT,                          -- JSON array
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- FLEET GROUP CHAT (agents talk to each other; user reads the thread)
CREATE TABLE IF NOT EXISTS fleet_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id    TEXT NOT NULL,
  agent_id    TEXT REFERENCES agents(id),
  role        TEXT NOT NULL,                  -- system|agent
  content     TEXT NOT NULL,
  event_type  TEXT,                             -- workout_logged|meal_logged|weight_logged
  source_id   INTEGER,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CHAT
CREATE TABLE IF NOT EXISTS chat_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id    TEXT NOT NULL,
  agent_id    TEXT NOT NULL REFERENCES agents(id),
  role        TEXT NOT NULL,                  -- user|assistant
  content     TEXT NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- SEED AGENTS
INSERT OR IGNORE INTO agents (id, name, role, color, domain, tick_ms, sleep_hours) VALUES
  ('anna',  'Anna',  'Nutrition',              '#84CC16', 'Meal logging, eggetarian recipe suggestions',           1800000, 12),
  ('agni',  'Agni',  'Calorie & Macro Tracker','#F59E0B', 'Daily calorie balance, macro split, TDEE recalibration',1800000, 12),
  ('bala',  'Bala',  'Workout',                '#3B82F6', 'Gym programming, running plans, progressive overload',   3600000, 12),
  ('nidra', 'Nidra', 'Recovery',               '#A855F7', 'Sleep, hydration, soreness, stress signals',            3600000, 8),
  ('sage',  'Sage',  'Chief Coach',            '#EC4899', 'Morning briefing, evening check-in, weekly recap',      300000,  6);

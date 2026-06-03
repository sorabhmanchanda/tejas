// Runs after schema.sql — upgrades older DBs for multi-user login_id columns.

function tableHasColumn(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function tableExists(db, table) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  return Boolean(row);
}

export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_users (
      login_id    TEXT PRIMARY KEY,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen   DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const userTables = [
    'meals',
    'workouts',
    'weight_log',
    'water_log',
    'sleep_log',
    'episodes',
    'entities',
    'findings',
    'briefings',
    'chat_messages',
  ];

  for (const table of userTables) {
    if (tableExists(db, table) && !tableHasColumn(db, table, 'login_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN login_id TEXT`);
    }
  }

  const profileCols = tableExists(db, 'user_profile')
    ? db.prepare('PRAGMA table_info(user_profile)').all()
    : [];
  const hasLoginPk = profileCols.some((c) => c.name === 'login_id');

  if (!hasLoginPk) {
    db.exec('DROP TABLE IF EXISTS user_profile');
    db.exec(`
      CREATE TABLE user_profile (
        login_id              TEXT PRIMARY KEY,
        name                  TEXT NOT NULL,
        age                   INTEGER NOT NULL,
        height_cm             INTEGER NOT NULL,
        current_weight_kg     REAL NOT NULL,
        goal_weight_kg        REAL,
        activity_level        TEXT NOT NULL,
        goal                  TEXT DEFAULT 'cut',
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
    `);
    console.log('[migrate] user_profile rebuilt for per-login_id accounts');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS fleet_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      login_id    TEXT NOT NULL,
      agent_id    TEXT REFERENCES agents(id),
      role        TEXT NOT NULL,
      content     TEXT NOT NULL,
      event_type  TEXT,
      source_id   INTEGER,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_fleet_login ON fleet_messages(login_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_meals_login ON meals(login_id);
    CREATE INDEX IF NOT EXISTS idx_workouts_login ON workouts(login_id);
    CREATE INDEX IF NOT EXISTS idx_findings_login ON findings(login_id);
    CREATE INDEX IF NOT EXISTS idx_chat_login ON chat_messages(login_id);
  `);
}

/** Wipe one user's data. Agents table is shared. */
export function resetUserData(db, loginId) {
  const del = (sql) => db.prepare(sql).run(loginId);
  del('DELETE FROM fleet_messages WHERE login_id = ?');
  del('DELETE FROM chat_messages WHERE login_id = ?');
  del('DELETE FROM briefings WHERE login_id = ?');
  del('DELETE FROM findings WHERE login_id = ?');
  del('DELETE FROM entities WHERE login_id = ?');
  del('DELETE FROM episodes WHERE login_id = ?');
  del('DELETE FROM sleep_log WHERE login_id = ?');
  del('DELETE FROM water_log WHERE login_id = ?');
  del('DELETE FROM weight_log WHERE login_id = ?');
  del('DELETE FROM workouts WHERE login_id = ?');
  del('DELETE FROM meals WHERE login_id = ?');
  del('DELETE FROM user_profile WHERE login_id = ?');
  del('DELETE FROM app_users WHERE login_id = ?');
}

/** Reset all users (fresh start for the whole app). */
export function resetAllUserData(db) {
  const tables = [
    'fleet_messages',
    'chat_messages',
    'briefings',
    'findings',
    'entities',
    'episodes',
    'sleep_log',
    'water_log',
    'weight_log',
    'workouts',
    'meals',
    'user_profile',
    'app_users',
  ];
  for (const t of tables) {
    if (tableExists(db, t)) db.exec(`DELETE FROM ${t}`);
  }
}

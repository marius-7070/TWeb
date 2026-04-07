PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS drone_fleet (
  id INTEGER PRIMARY KEY,
  model TEXT NOT NULL,
  role TEXT NOT NULL,
  callsign TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('ready', 'charging', 'maintenance')),
  battery_cycles INTEGER NOT NULL DEFAULT 0,
  home_base TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mission_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clearance_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT DEFAULT '',
  mission_type TEXT NOT NULL,
  priority TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'nou',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hangar_logs (
  id INTEGER PRIMARY KEY,
  drone_id INTEGER NOT NULL REFERENCES drone_fleet(id) ON DELETE CASCADE,
  mission_code TEXT NOT NULL UNIQUE,
  mission_type TEXT NOT NULL,
  sector TEXT NOT NULL,
  status TEXT NOT NULL,
  pilot_name TEXT NOT NULL,
  battery_delta INTEGER NOT NULL,
  summary TEXT NOT NULL,
  logged_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mission_requests_created_at
  ON mission_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_accounts_email
  ON user_accounts(email);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token
  ON user_sessions(session_token);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at
  ON user_sessions(expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_hangar_logs_logged_at
  ON hangar_logs(logged_at DESC);

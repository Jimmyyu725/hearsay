CREATE TABLE IF NOT EXISTS worlds (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  era         INTEGER NOT NULL,
  day         INTEGER NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL DEFAULT 'alive',
  started_at  TEXT    NOT NULL,
  ended_at    TEXT
);

CREATE TABLE IF NOT EXISTS agents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id    INTEGER NOT NULL,
  name        TEXT    NOT NULL,
  tribe       TEXT    NOT NULL,
  alive       INTEGER NOT NULL DEFAULT 1,
  born_day    INTEGER NOT NULL DEFAULT 0,
  died_day    INTEGER,
  honesty     INTEGER NOT NULL,
  aggression  INTEGER NOT NULL,
  loyalty     INTEGER NOT NULL,
  greed       INTEGER NOT NULL,
  paranoia    INTEGER NOT NULL,
  goal_type   TEXT    NOT NULL,
  goal_target TEXT,
  parents     TEXT,
  hungry_days INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventory (
  world_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  resource TEXT    NOT NULL,
  qty      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (world_id, agent_id, resource)
);

CREATE TABLE IF NOT EXISTS ledger (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id   INTEGER NOT NULL,
  day        INTEGER NOT NULL,
  from_agent INTEGER,
  to_agent   INTEGER,
  kind       TEXT    NOT NULL,
  resource   TEXT,
  qty        INTEGER,
  note       TEXT
);

CREATE TABLE IF NOT EXISTS impressions (
  world_id    INTEGER NOT NULL,
  subject     INTEGER NOT NULL,
  object      INTEGER NOT NULL,
  trust       INTEGER NOT NULL DEFAULT 0,
  opinion     TEXT    NOT NULL DEFAULT '',
  updated_day INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (world_id, subject, object)
);

CREATE TABLE IF NOT EXISTS episodes (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL,
  day      INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  about    INTEGER,
  kind     TEXT    NOT NULL,
  text     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS lies (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL,
  day      INTEGER NOT NULL,
  speaker  INTEGER NOT NULL,
  target   INTEGER NOT NULL,
  resource TEXT    NOT NULL,
  claimed  INTEGER NOT NULL,
  truth    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS utterances (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL,
  day      INTEGER NOT NULL,
  round    INTEGER NOT NULL,
  speaker  INTEGER NOT NULL,
  listener INTEGER NOT NULL,
  text     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS days (
  world_id   INTEGER NOT NULL,
  day        INTEGER NOT NULL,
  summary    TEXT    NOT NULL DEFAULT '',
  starved    INTEGER NOT NULL DEFAULT 0,
  eliminated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (world_id, day)
);

CREATE TABLE IF NOT EXISTS spend (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ymd        TEXT    NOT NULL,
  usd        REAL    NOT NULL,
  tokens_in  INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_world_day ON ledger (world_id, day);
CREATE INDEX IF NOT EXISTS idx_episodes_world_agent ON episodes (world_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_lies_world_speaker ON lies (world_id, speaker);
CREATE INDEX IF NOT EXISTS idx_spend_ymd ON spend (ymd);

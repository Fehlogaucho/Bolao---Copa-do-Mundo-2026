-- Schema do Bolão da Copa 2026 (Cloudflare D1 / SQLite) — v4
-- Contas com senha + regras de pontuação por bolão.

CREATE TABLE IF NOT EXISTS players (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  name_key   TEXT NOT NULL UNIQUE,
  pass_salt  TEXT NOT NULL,
  pass_hash  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Bolões (salas). Cada um tem código, dono e SUAS regras de pontuação.
CREATE TABLE IF NOT EXISTS pools (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  owner_id      INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  pts_exato     INTEGER NOT NULL DEFAULT 5,   -- cravar o placar exato
  pts_resultado INTEGER NOT NULL DEFAULT 3,   -- acertar vencedor/empate
  pts_gols      INTEGER NOT NULL DEFAULT 0,   -- bônus por acertar os gols de um time
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pool_members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id    INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending',  -- owner | approved | pending
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (pool_id, player_id)
);

-- Jogos (globais; placar reflete em todos os bolões).
CREATE TABLE IF NOT EXISTS matches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  match_num  INTEGER UNIQUE,
  fase       TEXT NOT NULL,
  grupo      TEXT,
  rodada     INTEGER,
  home       TEXT,
  away       TEXT,
  home_src   TEXT,
  away_src   TEXT,
  city       TEXT,
  kickoff    TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  advance    TEXT,
  finished   INTEGER NOT NULL DEFAULT 0
);

-- Palpites (globais por jogador, 1 por jogo, imutáveis).
CREATE TABLE IF NOT EXISTS predictions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  home       INTEGER NOT NULL,
  away       INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (player_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_pred_match   ON predictions (match_id);
CREATE INDEX IF NOT EXISTS idx_pred_player  ON predictions (player_id);
CREATE INDEX IF NOT EXISTS idx_match_kick   ON matches (kickoff);
CREATE INDEX IF NOT EXISTS idx_match_num    ON matches (match_num);
CREATE INDEX IF NOT EXISTS idx_pm_pool      ON pool_members (pool_id);
CREATE INDEX IF NOT EXISTS idx_pm_player    ON pool_members (player_id);

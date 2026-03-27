-- Initial schema for Rooms Upon Rooms runtime storage

CREATE TABLE IF NOT EXISTS ai_entities (
  game_id TEXT NOT NULL,
  id TEXT NOT NULL,
  tags TEXT NOT NULL,
  properties TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, id)
);

CREATE TABLE IF NOT EXISTS ai_handlers (
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, name)
);

CREATE TABLE IF NOT EXISTS events (
  game_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  command TEXT NOT NULL,
  events TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  PRIMARY KEY (game_id, seq)
);

CREATE TABLE IF NOT EXISTS conversation_entries (
  game_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  word TEXT NOT NULL,
  entry TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, npc_id, word)
);

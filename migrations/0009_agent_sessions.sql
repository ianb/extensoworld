-- Agent sessions and the world-edit log
--
-- An agent session represents one run of the agentic world editor: an LLM
-- tool-use loop that proposes structural changes to the shared world. Edits
-- are written to world_edits with applied=0 (pending) and become part of the
-- live ai_entities/ai_handlers tables only when the session calls finish().

CREATE TABLE agent_sessions (
  id           TEXT PRIMARY KEY,
  game_id      TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  request      TEXT NOT NULL,
  status       TEXT NOT NULL,            -- 'running' | 'finished' | 'bailed' | 'failed'
  messages     TEXT NOT NULL,            -- JSON: full Claude messages array
  saved_vars   TEXT NOT NULL,            -- JSON: { [name]: value }
  turn_count   INTEGER NOT NULL DEFAULT 0,
  turn_limit   INTEGER NOT NULL,
  summary      TEXT,                     -- finish() argument; populated at end
  revert_of    TEXT,                     -- nullable; another session id
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  finished_at  TEXT
);

CREATE INDEX idx_agent_sessions_game_status ON agent_sessions(game_id, status);

CREATE TABLE world_edits (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id      TEXT NOT NULL,
  session_id   TEXT NOT NULL REFERENCES agent_sessions(id),
  target_kind  TEXT NOT NULL,            -- 'entity' | 'handler'
  target_id    TEXT NOT NULL,
  op           TEXT NOT NULL,            -- 'create' | 'update' | 'delete'
  payload      TEXT,                     -- JSON; null for delete
  prior_state  TEXT,                     -- JSON; populated at commit time, null for create
  applied      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);

CREATE INDEX idx_world_edits_session ON world_edits(session_id, seq);
CREATE INDEX idx_world_edits_pending ON world_edits(game_id, applied);

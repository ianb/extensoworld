CREATE TABLE ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  call_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_ai_usage_user_time ON ai_usage(user_id, created_at);

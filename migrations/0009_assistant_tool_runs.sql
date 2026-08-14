PRAGMA foreign_keys = ON;

CREATE TABLE assistant_tool_runs (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL,
  tool_name TEXT NOT NULL CHECK (tool_name IN (
    'search_memory', 'get_wine_context', 'get_taste_profile', 'compare_wines', 'research_wine'
  )),
  arguments_hash TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (
    outcome IN ('ok', 'not_found', 'insufficient_data', 'forbidden', 'error')
  ),
  result_count INTEGER NOT NULL CHECK (result_count >= 0),
  citation_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(citation_ids_json)),
  provider TEXT NOT NULL,
  model_version TEXT,
  rule_version TEXT NOT NULL,
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_assistant_tool_runs_space_created
  ON assistant_tool_runs(space_id, created_at DESC);
CREATE INDEX idx_assistant_tool_runs_actor_created
  ON assistant_tool_runs(actor_user_id, created_at DESC);

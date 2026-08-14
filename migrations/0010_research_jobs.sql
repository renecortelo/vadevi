PRAGMA foreign_keys = ON;

CREATE TABLE research_jobs (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  wine_id TEXT NOT NULL REFERENCES wine_records(id) ON DELETE CASCADE,
  requested_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'degraded', 'failed')),
  locale TEXT NOT NULL CHECK (locale IN ('ca', 'de', 'en', 'es', 'fr', 'it', 'nl', 'pt-PT')),
  topics_json TEXT NOT NULL CHECK (json_valid(topics_json)),
  provider_mode TEXT NOT NULL CHECK (provider_mode IN ('none', 'open_data')),
  attempts_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(attempts_json)),
  fact_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(fact_ids_json)),
  source_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(source_ids_json)),
  warnings_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(warnings_json)),
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX idx_research_jobs_space_wine_created
  ON research_jobs(space_id, wine_id, created_at DESC);
CREATE INDEX idx_research_jobs_requester_created
  ON research_jobs(requested_by_user_id, created_at DESC);

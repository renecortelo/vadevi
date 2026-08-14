PRAGMA foreign_keys = ON;

CREATE TABLE external_adapter_cache (
  provider TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  response_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, cache_key)
);

CREATE TABLE external_rate_windows (
  provider TEXT NOT NULL,
  window_started_at TEXT NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 1),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, window_started_at)
);

CREATE INDEX idx_external_adapter_cache_expiry
  ON external_adapter_cache(expires_at);
CREATE INDEX idx_external_rate_windows_updated
  ON external_rate_windows(updated_at);

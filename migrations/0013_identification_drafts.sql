PRAGMA foreign_keys = ON;

-- §10.6: identification creates an expiring draft, it never creates a wine.
-- The draft holds the candidate fields the user is asked to confirm or edit, so
-- confirmation revalidates a server-held proposal rather than trusting whatever
-- the client sends back.
CREATE TABLE identification_drafts (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('needs_confirmation', 'manual_required')),
  -- Candidate field values plus their confidence and evidence class. This is
  -- application-generated proposal data, not third-party page content.
  candidates_json TEXT NOT NULL CHECK (json_valid(candidates_json)),
  warnings_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(warnings_json)),
  barcode TEXT,
  media_id TEXT REFERENCES media_assets(id),
  -- Set once the draft is confirmed, so a repeated confirmation returns the
  -- wine that already exists instead of creating a second one.
  confirmed_wine_id TEXT REFERENCES wine_records(id),
  confirmed_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_identification_drafts_user_expiry
  ON identification_drafts(user_id, space_id, expires_at);

CREATE INDEX idx_identification_drafts_expiry
  ON identification_drafts(expires_at);

-- Scanning a bottle already in the Space is the highest-value match, and it
-- needs no external provider at all.
CREATE INDEX idx_wine_records_space_barcode
  ON wine_records(space_id, barcode)
  WHERE barcode IS NOT NULL AND deleted_at IS NULL;

-- OCR is an optional capability with its own daily cap, alongside the existing
-- language, research, barcode, and price budgets.
DROP INDEX idx_usage_counters_date_metric;

CREATE TABLE usage_counters_next (
  usage_date TEXT NOT NULL CHECK (length(usage_date) = 10),
  scope TEXT NOT NULL CHECK (scope IN ('global', 'space', 'user')),
  scope_id TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN (
    'ai_language_calls', 'research_lookups', 'barcode_lookups', 'price_lookups', 'ocr_reads'
  )),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (usage_date, scope, scope_id, metric)
);

INSERT INTO usage_counters_next (usage_date, scope, scope_id, metric, used, created_at, updated_at)
SELECT usage_date, scope, scope_id, metric, used, created_at, updated_at FROM usage_counters;

DROP TABLE usage_counters;

ALTER TABLE usage_counters_next RENAME TO usage_counters;

CREATE INDEX idx_usage_counters_date_metric
  ON usage_counters(usage_date, metric);

PRAGMA foreign_keys = ON;

-- Confirmed, idempotent deletion of a Space or an account. The partial unique
-- index keeps at most one open job per target so repeated confirmation is safe.
-- The scheduled handler executes due jobs so purging never depends on a later
-- interactive request.
CREATE TABLE deletion_jobs (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('space', 'account')),
  target_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL CHECK (state IN ('scheduled', 'canceled', 'completed')),
  grace_period_seconds INTEGER NOT NULL CHECK (grace_period_seconds >= 0),
  purge_after TEXT NOT NULL,
  media_objects_removed INTEGER NOT NULL DEFAULT 0 CHECK (media_objects_removed >= 0),
  rows_removed INTEGER NOT NULL DEFAULT 0 CHECK (rows_removed >= 0),
  canceled_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (canceled_at IS NULL OR completed_at IS NULL)
);

CREATE UNIQUE INDEX idx_deletion_jobs_open_target
  ON deletion_jobs(target_type, target_id)
  WHERE state = 'scheduled';

CREATE INDEX idx_deletion_jobs_due
  ON deletion_jobs(state, purge_after);

-- Application-level daily budgets. Counters hold aggregate integers only: no
-- wine name, note text, chat text, email, location, or provider payload.
CREATE TABLE usage_counters (
  usage_date TEXT NOT NULL CHECK (length(usage_date) = 10),
  scope TEXT NOT NULL CHECK (scope IN ('global', 'space', 'user')),
  scope_id TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN (
    'ai_language_calls', 'research_lookups', 'barcode_lookups', 'price_lookups'
  )),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (usage_date, scope, scope_id, metric)
);

CREATE INDEX idx_usage_counters_date_metric
  ON usage_counters(usage_date, metric);

-- A merge never happens implicitly. The losing record keeps a tombstone that
-- points at the surviving wine so existing references and audit stay resolvable.
ALTER TABLE wine_records ADD COLUMN merged_into_wine_id TEXT REFERENCES wine_records(id);
ALTER TABLE wine_records ADD COLUMN merged_at TEXT;

-- Accent-insensitive filter columns. Application writes populate these with the
-- canonical NFKD normalizer used by the Wine Memory repository. The statements
-- below are a best-effort backfill that folds the Latin accents and separators
-- used by the eight supported locales, so rows written before this migration
-- still match an unaccented filter.
ALTER TABLE wine_records ADD COLUMN normalized_region TEXT;
ALTER TABLE wine_records ADD COLUMN normalized_country_code TEXT;
ALTER TABLE wine_grapes ADD COLUMN normalized_name TEXT;

UPDATE wine_records SET normalized_region = lower(COALESCE(region, ''));
UPDATE wine_records SET normalized_region = replace(normalized_region, 'á', 'a');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'à', 'a');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'â', 'a');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ä', 'a');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ã', 'a');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'å', 'a');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'é', 'e');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'è', 'e');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ê', 'e');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ë', 'e');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'í', 'i');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ì', 'i');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'î', 'i');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ï', 'i');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ó', 'o');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ò', 'o');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ô', 'o');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ö', 'o');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'õ', 'o');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ø', 'o');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ú', 'u');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ù', 'u');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'û', 'u');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ü', 'u');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ç', 'c');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ñ', 'n');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ý', 'y');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ÿ', 'y');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'æ', 'ae');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'œ', 'oe');
UPDATE wine_records SET normalized_region = replace(normalized_region, 'ß', 'ss');
UPDATE wine_records SET normalized_region = replace(normalized_region, '-', ' ');
UPDATE wine_records SET normalized_region = replace(normalized_region, '.', ' ');
UPDATE wine_records SET normalized_region = replace(normalized_region, '''', ' ');
UPDATE wine_records SET normalized_region = replace(normalized_region, ',', ' ');
UPDATE wine_records SET normalized_region = replace(normalized_region, '/', ' ');
UPDATE wine_records SET normalized_region = trim(normalized_region);

UPDATE wine_records SET normalized_country_code = upper(country_code)
  WHERE country_code IS NOT NULL;

UPDATE wine_grapes SET normalized_name = lower(COALESCE(name_snapshot, ''));
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'á', 'a');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'à', 'a');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'â', 'a');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ä', 'a');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ã', 'a');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'å', 'a');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'é', 'e');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'è', 'e');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ê', 'e');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ë', 'e');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'í', 'i');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ì', 'i');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'î', 'i');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ï', 'i');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ó', 'o');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ò', 'o');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ô', 'o');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ö', 'o');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'õ', 'o');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ø', 'o');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ú', 'u');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ù', 'u');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'û', 'u');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ü', 'u');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ç', 'c');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ñ', 'n');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ý', 'y');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ÿ', 'y');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'æ', 'ae');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'œ', 'oe');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, 'ß', 'ss');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, '-', ' ');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, '.', ' ');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, '''', ' ');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, ',', ' ');
UPDATE wine_grapes SET normalized_name = replace(normalized_name, '/', ' ');
UPDATE wine_grapes SET normalized_name = trim(normalized_name);

CREATE INDEX idx_wine_records_merged_into
  ON wine_records(space_id, merged_into_wine_id);
CREATE INDEX idx_wine_records_space_type_updated
  ON wine_records(space_id, wine_type, updated_at DESC, id);
CREATE INDEX idx_wine_records_space_region
  ON wine_records(space_id, normalized_region);
CREATE INDEX idx_wine_records_space_country
  ON wine_records(space_id, normalized_country_code);
CREATE INDEX idx_wine_grapes_space_normalized
  ON wine_grapes(space_id, normalized_name);

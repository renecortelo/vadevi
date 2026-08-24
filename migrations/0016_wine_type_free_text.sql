-- Widen the wine types a bottle may carry (vermouth, and whatever comes next)
-- without another migration each time. The value was pinned by a column CHECK, so
-- a new kind meant rebuilding the table; it becomes free text here, validated at
-- the API by the WineType schema — the same choice the fact predicates already
-- make. SQLite cannot drop a CHECK in place, so the table is rebuilt once, the
-- same copy-drop-rename this codebase already uses for a table (0013). D1 manages
-- foreign keys across a migration itself, so no PRAGMA is needed or accepted.
CREATE TABLE wine_records_new (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  producer_name TEXT NOT NULL,
  normalized_producer_name TEXT NOT NULL,
  vintage_year INTEGER CHECK (vintage_year IS NULL OR vintage_year BETWEEN 1000 AND 2100),
  non_vintage INTEGER NOT NULL DEFAULT 0 CHECK (non_vintage IN (0, 1)),
  wine_type TEXT,
  country_code TEXT,
  region TEXT,
  appellation TEXT,
  alcohol_abv_milli INTEGER CHECK (alcohol_abv_milli IS NULL OR alcohol_abv_milli BETWEEN 0 AND 100000),
  bottle_size_ml INTEGER CHECK (bottle_size_ml IS NULL OR bottle_size_ml BETWEEN 50 AND 20000),
  barcode TEXT,
  style_text TEXT,
  identity_status TEXT NOT NULL CHECK (identity_status IN ('draft', 'confirmed', 'needs_review')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  confirmed_by_user_id TEXT REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  merged_into_wine_id TEXT REFERENCES wine_records(id),
  merged_at TEXT,
  normalized_region TEXT,
  normalized_country_code TEXT,
  CHECK (non_vintage = 0 OR vintage_year IS NULL)
);

INSERT INTO wine_records_new (
  id, space_id, display_name, normalized_name, producer_name, normalized_producer_name,
  vintage_year, non_vintage, wine_type, country_code, region, appellation, alcohol_abv_milli,
  bottle_size_ml, barcode, style_text, identity_status, created_by_user_id, confirmed_by_user_id,
  version, created_at, updated_at, deleted_at, merged_into_wine_id, merged_at, normalized_region,
  normalized_country_code
)
SELECT
  id, space_id, display_name, normalized_name, producer_name, normalized_producer_name,
  vintage_year, non_vintage, wine_type, country_code, region, appellation, alcohol_abv_milli,
  bottle_size_ml, barcode, style_text, identity_status, created_by_user_id, confirmed_by_user_id,
  version, created_at, updated_at, deleted_at, merged_into_wine_id, merged_at, normalized_region,
  normalized_country_code
FROM wine_records;

DROP TABLE wine_records;
ALTER TABLE wine_records_new RENAME TO wine_records;

CREATE INDEX idx_wine_records_identity
  ON wine_records(space_id, normalized_producer_name, normalized_name, vintage_year);
CREATE INDEX idx_wine_records_updated
  ON wine_records(space_id, updated_at, id);
CREATE INDEX idx_wine_records_merged_into
  ON wine_records(space_id, merged_into_wine_id);
CREATE INDEX idx_wine_records_space_type_updated
  ON wine_records(space_id, wine_type, updated_at DESC, id);
CREATE INDEX idx_wine_records_space_region
  ON wine_records(space_id, normalized_region);
CREATE INDEX idx_wine_records_space_country
  ON wine_records(space_id, normalized_country_code);
CREATE INDEX idx_wine_records_space_barcode
  ON wine_records(space_id, barcode)
  WHERE barcode IS NOT NULL AND deleted_at IS NULL;

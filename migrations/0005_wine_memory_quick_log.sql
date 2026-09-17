PRAGMA foreign_keys = ON;

CREATE TABLE wine_records (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  producer_name TEXT NOT NULL,
  normalized_producer_name TEXT NOT NULL,
  vintage_year INTEGER CHECK (vintage_year IS NULL OR vintage_year BETWEEN 1000 AND 2100),
  non_vintage INTEGER NOT NULL DEFAULT 0 CHECK (non_vintage IN (0, 1)),
  wine_type TEXT CHECK (wine_type IS NULL OR wine_type IN ('red', 'white', 'rose', 'sparkling', 'fortified', 'orange', 'other')),
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
  CHECK (non_vintage = 0 OR vintage_year IS NULL)
);

CREATE TABLE wine_grapes (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  wine_id TEXT NOT NULL REFERENCES wine_records(id),
  grape_code TEXT,
  name_snapshot TEXT NOT NULL,
  percentage_milli INTEGER CHECK (percentage_milli IS NULL OR percentage_milli BETWEEN 0 AND 100000),
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (wine_id, position)
);

CREATE TABLE wine_aliases (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  wine_id TEXT NOT NULL REFERENCES wine_records(id),
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('display', 'producer', 'merge')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('label', 'receipt', 'shelf', 'avatar', 'other')),
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  sha256 TEXT NOT NULL,
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 2048),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 2048),
  processing_status TEXT NOT NULL CHECK (processing_status IN ('reserved', 'ready', 'rejected')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE wine_media (
  wine_id TEXT NOT NULL REFERENCES wine_records(id),
  media_id TEXT NOT NULL REFERENCES media_assets(id),
  role TEXT NOT NULL CHECK (role IN ('front_label', 'back_label', 'bottle', 'receipt', 'other')),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (wine_id, media_id)
);

CREATE TABLE tasting_notes (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  wine_id TEXT NOT NULL REFERENCES wine_records(id),
  session_wine_id TEXT,
  author_user_id TEXT NOT NULL REFERENCES users(id),
  mode TEXT NOT NULL CHECK (mode IN ('quick', 'deep')),
  state TEXT NOT NULL CHECK (state IN ('draft', 'submitted')),
  tasted_at TEXT NOT NULL,
  score_100 INTEGER CHECK (score_100 IS NULL OR score_100 BETWEEN 0 AND 100),
  sentiment TEXT CHECK (sentiment IS NULL OR sentiment IN ('dislike', 'neutral', 'like')),
  would_drink_again TEXT CHECK (would_drink_again IS NULL OR would_drink_again IN ('yes', 'no', 'unsure')),
  would_buy TEXT CHECK (would_buy IS NULL OR would_buy IN ('yes', 'no', 'unsure')),
  perceived_value INTEGER CHECK (perceived_value IS NULL OR perceived_value BETWEEN 1 AND 5),
  comment TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE tasting_contexts (
  tasting_note_id TEXT PRIMARY KEY REFERENCES tasting_notes(id),
  space_id TEXT NOT NULL REFERENCES spaces(id),
  food_text TEXT,
  environment_code TEXT,
  glass_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tasting_descriptors (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  tasting_note_id TEXT NOT NULL REFERENCES tasting_notes(id),
  phase TEXT NOT NULL CHECK (phase IN ('appearance', 'nose', 'palate')),
  descriptor_code TEXT NOT NULL,
  label_snapshot TEXT NOT NULL,
  intensity INTEGER CHECK (intensity IS NULL OR intensity BETWEEN 1 AND 5),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tasting_note_id, descriptor_code)
);

CREATE TABLE sync_mutations (
  user_id TEXT NOT NULL REFERENCES users(id),
  mutation_id TEXT NOT NULL,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  request_hash TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('wine_record', 'tasting_note')),
  resource_id TEXT NOT NULL,
  resource_version INTEGER NOT NULL,
  applied_at TEXT NOT NULL,
  PRIMARY KEY (user_id, mutation_id)
);

CREATE INDEX idx_wine_records_identity
  ON wine_records(space_id, normalized_producer_name, normalized_name, vintage_year);
CREATE INDEX idx_wine_records_updated
  ON wine_records(space_id, updated_at, id);
CREATE INDEX idx_wine_aliases_normalized
  ON wine_aliases(space_id, normalized_alias);
CREATE INDEX idx_media_assets_space_status
  ON media_assets(space_id, processing_status, created_at);
CREATE INDEX idx_tasting_notes_author_date
  ON tasting_notes(space_id, author_user_id, tasted_at);
CREATE INDEX idx_tasting_notes_wine_date
  ON tasting_notes(space_id, wine_id, tasted_at);
CREATE INDEX idx_sync_mutations_space_applied
  ON sync_mutations(space_id, applied_at);

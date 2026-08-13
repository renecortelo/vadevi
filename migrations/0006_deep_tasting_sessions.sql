PRAGMA foreign_keys = ON;

ALTER TABLE tasting_notes ADD COLUMN memorable INTEGER CHECK (memorable IS NULL OR memorable IN (0, 1));
ALTER TABLE tasting_notes ADD COLUMN pairing_success INTEGER CHECK (pairing_success IS NULL OR pairing_success BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN expectation_result TEXT CHECK (expectation_result IS NULL OR expectation_result IN ('below', 'met', 'above', 'unknown'));
ALTER TABLE tasting_notes ADD COLUMN tasting_confidence INTEGER CHECK (tasting_confidence IS NULL OR tasting_confidence BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN appearance_text TEXT;
ALTER TABLE tasting_notes ADD COLUMN nose_text TEXT;
ALTER TABLE tasting_notes ADD COLUMN palate_text TEXT;
ALTER TABLE tasting_notes ADD COLUMN conclusion_text TEXT;
ALTER TABLE tasting_notes ADD COLUMN appearance_clarity TEXT CHECK (appearance_clarity IS NULL OR appearance_clarity IN ('clear', 'hazy'));
ALTER TABLE tasting_notes ADD COLUMN appearance_color_family TEXT CHECK (appearance_color_family IS NULL OR appearance_color_family IN ('white', 'rose', 'red', 'orange', 'brown'));
ALTER TABLE tasting_notes ADD COLUMN appearance_hue TEXT;
ALTER TABLE tasting_notes ADD COLUMN appearance_intensity INTEGER CHECK (appearance_intensity IS NULL OR appearance_intensity BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN rim_evolution INTEGER CHECK (rim_evolution IS NULL OR rim_evolution BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN viscosity INTEGER CHECK (viscosity IS NULL OR viscosity BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN nose_condition TEXT CHECK (nose_condition IS NULL OR nose_condition IN ('clean', 'possible_fault'));
ALTER TABLE tasting_notes ADD COLUMN nose_intensity INTEGER CHECK (nose_intensity IS NULL OR nose_intensity BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN nose_freshness INTEGER CHECK (nose_freshness IS NULL OR nose_freshness BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN nose_development INTEGER CHECK (nose_development IS NULL OR nose_development BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN sweetness INTEGER CHECK (sweetness IS NULL OR sweetness BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN acidity INTEGER CHECK (acidity IS NULL OR acidity BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN tannin_level INTEGER CHECK (tannin_level IS NULL OR tannin_level BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN tannin_texture TEXT CHECK (tannin_texture IS NULL OR tannin_texture IN ('silky', 'fine', 'grippy', 'coarse'));
ALTER TABLE tasting_notes ADD COLUMN alcohol_perception INTEGER CHECK (alcohol_perception IS NULL OR alcohol_perception BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN body INTEGER CHECK (body IS NULL OR body BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN flavor_intensity INTEGER CHECK (flavor_intensity IS NULL OR flavor_intensity BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN palate_texture TEXT CHECK (palate_texture IS NULL OR palate_texture IN ('lean', 'round', 'creamy', 'oily', 'other'));
ALTER TABLE tasting_notes ADD COLUMN finish_length INTEGER CHECK (finish_length IS NULL OR finish_length BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN balance INTEGER CHECK (balance IS NULL OR balance BETWEEN 1 AND 5);
ALTER TABLE tasting_notes ADD COLUMN complexity INTEGER CHECK (complexity IS NULL OR complexity BETWEEN 1 AND 5);

ALTER TABLE tasting_contexts ADD COLUMN serving_temperature_tenths_c INTEGER CHECK (serving_temperature_tenths_c IS NULL OR serving_temperature_tenths_c BETWEEN -100 AND 500);
ALTER TABLE tasting_contexts ADD COLUMN opened_state TEXT CHECK (opened_state IS NULL OR opened_state IN ('just_opened', 'open', 'preserved', 'unknown'));
ALTER TABLE tasting_contexts ADD COLUMN minutes_open INTEGER CHECK (minutes_open IS NULL OR minutes_open BETWEEN 0 AND 10080);
ALTER TABLE tasting_contexts ADD COLUMN decanted INTEGER CHECK (decanted IS NULL OR decanted IN (0, 1));
ALTER TABLE tasting_contexts ADD COLUMN aeration_minutes INTEGER CHECK (aeration_minutes IS NULL OR aeration_minutes BETWEEN 0 AND 10080);
ALTER TABLE tasting_contexts ADD COLUMN preservation_method TEXT;
ALTER TABLE tasting_contexts ADD COLUMN bottle_condition TEXT;
ALTER TABLE tasting_contexts ADD COLUMN room_temperature_tenths_c INTEGER CHECK (room_temperature_tenths_c IS NULL OR room_temperature_tenths_c BETWEEN -100 AND 600);
ALTER TABLE tasting_contexts ADD COLUMN light_level INTEGER CHECK (light_level IS NULL OR light_level BETWEEN 1 AND 5);
ALTER TABLE tasting_contexts ADD COLUMN noise_level INTEGER CHECK (noise_level IS NULL OR noise_level BETWEEN 1 AND 5);
ALTER TABLE tasting_contexts ADD COLUMN ambient_smell_level INTEGER CHECK (ambient_smell_level IS NULL OR ambient_smell_level BETWEEN 1 AND 5);
ALTER TABLE tasting_contexts ADD COLUMN palate_cleanser TEXT;
ALTER TABLE tasting_contexts ADD COLUMN previous_session_wine_id TEXT;

CREATE TABLE tasting_sessions (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  name TEXT NOT NULL,
  description TEXT,
  venue_text TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'completed')),
  blind INTEGER NOT NULL DEFAULT 0 CHECK (blind IN (0, 1)),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (ends_at IS NULL OR ends_at >= starts_at),
  CHECK (blind = 0)
);

CREATE TABLE session_wines (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  session_id TEXT NOT NULL REFERENCES tasting_sessions(id),
  wine_id TEXT NOT NULL REFERENCES wine_records(id),
  position INTEGER NOT NULL CHECK (position >= 0),
  serving_label TEXT,
  reveal_state TEXT NOT NULL DEFAULT 'revealed' CHECK (reveal_state = 'revealed'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (session_id, position)
);

CREATE TABLE session_wine_summaries (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  session_wine_id TEXT NOT NULL REFERENCES session_wines(id),
  included_note_count INTEGER NOT NULL CHECK (included_note_count >= 0),
  algorithm_version TEXT NOT NULL,
  computed_score_milli INTEGER,
  dispersion_milli INTEGER,
  comparison_json TEXT NOT NULL,
  source_version_hash TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  UNIQUE (session_wine_id, algorithm_version)
);

CREATE UNIQUE INDEX idx_tasting_notes_active_session_author
  ON tasting_notes(session_wine_id, author_user_id)
  WHERE session_wine_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_tasting_sessions_space_date
  ON tasting_sessions(space_id, starts_at DESC, id DESC);
CREATE INDEX idx_session_wines_flight
  ON session_wines(space_id, session_id, position);
CREATE INDEX idx_session_wine_summaries_session_wine
  ON session_wine_summaries(space_id, session_wine_id, computed_at);

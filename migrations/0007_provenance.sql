PRAGMA foreign_keys = ON;

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (
    source_type IN ('producer', 'regulator', 'specialist', 'open_dataset', 'other_web', 'user_artifact')
  ),
  license_identifier TEXT,
  retrieved_at TEXT NOT NULL,
  last_checked_at TEXT,
  content_hash TEXT,
  created_by_user_id TEXT REFERENCES users(id),
  created_by_provider TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (created_by_user_id IS NOT NULL AND created_by_provider IS NULL)
    OR (created_by_user_id IS NULL AND created_by_provider IS NOT NULL)
  ),
  UNIQUE (space_id, canonical_url)
);

CREATE TABLE facts (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  subject_type TEXT NOT NULL CHECK (
    subject_type IN ('wine', 'producer', 'grape', 'region', 'price_observation')
  ),
  subject_id TEXT NOT NULL,
  predicate TEXT NOT NULL,
  value_json TEXT NOT NULL,
  evidence_class TEXT NOT NULL CHECK (
    evidence_class IN ('observed', 'researched', 'inferred', 'personal')
  ),
  confidence_milli INTEGER CHECK (confidence_milli IS NULL OR confidence_milli BETWEEN 0 AND 1000),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'accepted', 'disputed', 'retired')),
  observed_by_user_id TEXT REFERENCES users(id),
  verified_by_user_id TEXT REFERENCES users(id),
  verified_at TEXT,
  research_method TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE fact_citations (
  fact_id TEXT NOT NULL REFERENCES facts(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  locator TEXT,
  support_strength TEXT NOT NULL CHECK (support_strength IN ('direct', 'supporting', 'context')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (fact_id, source_id)
);

CREATE UNIQUE INDEX idx_facts_one_accepted
  ON facts(space_id, subject_type, subject_id, predicate)
  WHERE status = 'accepted' AND deleted_at IS NULL;
CREATE INDEX idx_facts_subject
  ON facts(space_id, subject_type, subject_id, predicate, status, created_at);
CREATE INDEX idx_sources_canonical
  ON sources(space_id, canonical_url);
CREATE INDEX idx_fact_citations_source
  ON fact_citations(source_id, fact_id);

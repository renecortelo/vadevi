-- The wine library: reference knowledge about grapes (and, later, regions and
-- styles), held in the database so Vicenç and the evidence page can answer
-- "what does a Garnacha smell like?" without a web lookup — and without the
-- model's memory, which is never a source.
--
-- It is built offline by `pnpm kb:*` from open sources (Wikidata, Wikipedia)
-- and loaded by `pnpm kb:load`. Every structured value carries the sentence
-- it came from in `kb_evidence`; nothing enters on a model's word alone.
--
-- Global, not Space-scoped: the same for every reader, read-only to the
-- application, replaced whole on each load. No row here is personal data.

CREATE TABLE kb_grapes (
  id TEXT PRIMARY KEY,
  wikidata_id TEXT NOT NULL UNIQUE,
  color TEXT CHECK (color IS NULL OR color IN ('white', 'red', 'pink')),
  origin_country_code TEXT CHECK (origin_country_code IS NULL OR length(origin_country_code) = 2),
  acidity TEXT CHECK (acidity IS NULL OR acidity IN ('low', 'medium', 'high')),
  tannin TEXT CHECK (tannin IS NULL OR tannin IN ('low', 'medium', 'high')),
  body TEXT CHECK (body IS NULL OR body IN ('low', 'medium', 'high')),
  prominence INTEGER NOT NULL CHECK (prominence >= 0),
  wikipedia_url TEXT
);

-- Every name an entity goes by, in every language: the primary name per
-- locale, and the synonyms ("Tinto Fino", "Ull de Llebre") under locale '*'.
-- `normalized_name` is the accent- and case-free form search compares.
CREATE TABLE kb_names (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('grape', 'region', 'style')),
  entity_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('primary', 'synonym')),
  source TEXT NOT NULL CHECK (source IN ('wikidata', 'article', 'curated')),
  PRIMARY KEY (entity_type, entity_id, locale, normalized_name)
);
CREATE INDEX idx_kb_names_lookup ON kb_names(normalized_name, entity_type);

-- A short description per locale: the lead of that language's Wikipedia
-- article where one exists, a marked translation where not.
CREATE TABLE kb_summaries (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('grape', 'region', 'style')),
  entity_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  text TEXT NOT NULL,
  source_url TEXT NOT NULL,
  license TEXT NOT NULL,
  translated INTEGER NOT NULL DEFAULT 0 CHECK (translated IN (0, 1)),
  PRIMARY KEY (entity_type, entity_id, locale)
);

-- A grape's many-valued attributes: aromas, where it is grown, the kinds of
-- wine made from it, what it is said to go with.
CREATE TABLE kb_grape_attributes (
  grape_id TEXT NOT NULL REFERENCES kb_grapes(id),
  kind TEXT NOT NULL CHECK (kind IN ('aroma', 'region', 'style', 'pairing')),
  value TEXT NOT NULL,
  country_code TEXT,
  PRIMARY KEY (grape_id, kind, value)
);
CREATE INDEX idx_kb_grape_attributes_value ON kb_grape_attributes(kind, value);

-- The sentence behind each structured value: what a reader sees when they
-- ask "says who?".
CREATE TABLE kb_evidence (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('grape', 'region', 'style')),
  entity_id TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  quote TEXT NOT NULL,
  source_url TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id, field, value)
);

-- Which build is loaded: a content hash, so a deploy reloads only on change.
CREATE TABLE kb_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

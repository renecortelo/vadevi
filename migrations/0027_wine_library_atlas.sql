-- The wine library's atlas: the EU's protected wine names, from the register.
--
-- One row per registered PDO or PGI for wine in eAmbrosia, the EU's legal
-- register of geographical indications, with what Wikidata adds where it
-- links the name to an item: coordinates and a Wikipedia article. Names in
-- every language go in kb_names (entity_type 'region'), summaries in
-- kb_summaries, as for grapes.
--
-- kb_names is rebuilt to admit the register as a source of names. Like every
-- kb_ table it is replaced whole by `pnpm kb:load`, which the deploy runs
-- right after migrations, so dropping its rows here loses nothing.

DROP TABLE kb_names;
CREATE TABLE kb_names (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('grape', 'region', 'style')),
  entity_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('primary', 'synonym')),
  source TEXT NOT NULL CHECK (source IN ('wikidata', 'article', 'curated', 'register')),
  PRIMARY KEY (entity_type, entity_id, locale, normalized_name)
);
CREATE INDEX idx_kb_names_lookup ON kb_names(normalized_name, entity_type);

CREATE TABLE kb_regions (
  id TEXT PRIMARY KEY,
  eambrosia_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL CHECK (length(country_code) = 2),
  gi_type TEXT NOT NULL CHECK (gi_type IN ('PDO', 'PGI')),
  registered_on TEXT,
  legal_url TEXT,
  latitude REAL,
  longitude REAL,
  wikidata_id TEXT,
  prominence INTEGER NOT NULL DEFAULT 0 CHECK (prominence >= 0)
);
CREATE INDEX idx_kb_regions_country ON kb_regions(country_code);

-- A grape grown in a region, as the grape's own article says — with the
-- sentence. Never inferred: a region with no grape here simply has none
-- recorded yet.
CREATE TABLE kb_region_grapes (
  region_id TEXT NOT NULL REFERENCES kb_regions(id),
  grape_id TEXT NOT NULL REFERENCES kb_grapes(id),
  quote TEXT NOT NULL,
  source_url TEXT NOT NULL,
  PRIMARY KEY (region_id, grape_id)
);
CREATE INDEX idx_kb_region_grapes_grape ON kb_region_grapes(grape_id);

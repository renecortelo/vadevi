-- Chile's viticultural areas beside the other registers' kinds of area: the
-- register_level column no longer lists the kinds it admits. Each register
-- that joins the atlas brings its own (Chile's 'area', after Australia's and
-- South Africa's), and listing them here rebuilt the table each time; the
-- API's contract (RegionLevelSchema) checks every value it serves, and the
-- library build writes only those.
--
-- SQLite cannot drop a CHECK in place, so kb_regions is rebuilt as in 0033
-- and 0035, with kb_region_grapes pointing at the new table from the start.
-- Both are filled by `pnpm kb:load`, which the deploy runs right after
-- migrations; the rows are copied across all the same.
PRAGMA defer_foreign_keys = true;

CREATE TABLE kb_regions_new (
  id TEXT PRIMARY KEY,
  eambrosia_id TEXT UNIQUE,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL CHECK (length(country_code) = 2),
  gi_type TEXT NOT NULL
    CHECK (gi_type IN ('PDO', 'PGI', 'AVA', 'GI', 'WO', 'DO', 'IG', 'IP', 'DOC')),
  registered_on TEXT,
  legal_url TEXT,
  latitude REAL,
  longitude REAL,
  wikidata_id TEXT,
  prominence INTEGER NOT NULL DEFAULT 0 CHECK (prominence >= 0),
  point_source TEXT
    CHECK (point_source IS NULL OR point_source IN ('item', 'area', 'place', 'boundary')),
  register_categories TEXT,
  register_grapes TEXT,
  register_source_url TEXT,
  register_ref TEXT,
  within TEXT,
  register_level TEXT
);

INSERT INTO kb_regions_new (
  id, eambrosia_id, name, country_code, gi_type, registered_on, legal_url,
  latitude, longitude, wikidata_id, prominence, point_source,
  register_categories, register_grapes, register_source_url, register_ref,
  within, register_level
)
SELECT
  id, eambrosia_id, name, country_code, gi_type, registered_on, legal_url,
  latitude, longitude, wikidata_id, prominence, point_source,
  register_categories, register_grapes, register_source_url, register_ref,
  within, register_level
FROM kb_regions;

CREATE TABLE kb_region_grapes_new (
  region_id TEXT NOT NULL REFERENCES kb_regions_new(id),
  grape_id TEXT NOT NULL REFERENCES kb_grapes(id),
  quote TEXT NOT NULL,
  source_url TEXT NOT NULL,
  PRIMARY KEY (region_id, grape_id)
);
INSERT INTO kb_region_grapes_new (region_id, grape_id, quote, source_url)
SELECT region_id, grape_id, quote, source_url FROM kb_region_grapes;

-- The old child first, then its parent: nothing points at either any more.
DROP TABLE kb_region_grapes;
DROP TABLE kb_regions;
-- Renaming the parent carries the child's reference along with it.
ALTER TABLE kb_regions_new RENAME TO kb_regions;
ALTER TABLE kb_region_grapes_new RENAME TO kb_region_grapes;
CREATE INDEX idx_kb_regions_country ON kb_regions(country_code);
CREATE INDEX idx_kb_region_grapes_grape ON kb_region_grapes(grape_id);

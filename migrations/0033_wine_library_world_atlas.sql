-- The atlas beyond the EU: wine names protected by other countries' own
-- registers — the American Viticultural Areas first (27 CFR part 9), then
-- Australia's, New Zealand's, South Africa's… geographical indications.
--
-- kb_regions is rebuilt, since SQLite cannot relax a column in place:
--   * eambrosia_id may be empty: a name outside the EU register has no
--     eAmbrosia id (it stays unique where present);
--   * gi_type admits each register's own designation: 'AVA' (United States),
--     'GI' (Australia, New Zealand), 'WO' (South Africa), 'DO' (Chile), 'IG',
--     'IP' and 'DOC' (Argentina), beside the EU's 'PDO' and 'PGI';
--   * point_source admits 'boundary': a point inside the name's official
--     boundary, which is exact;
--   * register_ref holds the name's place in its register where that is not
--     an eAmbrosia id: "27 CFR 9.23" for Napa Valley.
--
-- kb_region_grapes, which points at kb_regions, is rebuilt with it, pointing
-- at the new table from the start: dropping a table that rows still point
-- at counts them as broken references even if a table of the same name
-- takes its place, and the migration would be rolled back.
--
-- Like every kb_ table both are filled by `pnpm kb:load`, which the deploy
-- runs right after migrations; the rows are copied across all the same.
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
  register_ref TEXT
);

INSERT INTO kb_regions_new (
  id, eambrosia_id, name, country_code, gi_type, registered_on, legal_url,
  latitude, longitude, wikidata_id, prominence, point_source,
  register_categories, register_grapes, register_source_url
)
SELECT
  id, eambrosia_id, name, country_code, gi_type, registered_on, legal_url,
  latitude, longitude, wikidata_id, prominence, point_source,
  register_categories, register_grapes, register_source_url
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

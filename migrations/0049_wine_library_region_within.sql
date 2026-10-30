-- The names each registered name lies within, one row a pair, so a region's
-- card finds the names inside it by its key instead of reading every
-- region's `within` list (some 4,400 rows read a card). Filled from
-- `kb_regions.within` by `pnpm kb:load`, which the deploy runs right after
-- migrations.
CREATE TABLE kb_region_within (
  within_id TEXT NOT NULL REFERENCES kb_regions(id),
  region_id TEXT NOT NULL REFERENCES kb_regions(id),
  PRIMARY KEY (within_id, region_id)
) WITHOUT ROWID;

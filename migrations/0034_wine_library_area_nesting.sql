-- Where a registered name lies within others, and what kind of area its
-- register calls it.
--
--   * within: the ids of the atlas's names whose area holds this one's, the
--     nearest first, as a JSON array — a South African ward's district, its
--     region, its geographical unit…; the AVAs an AVA lies within. Empty
--     (NULL) where the register says nothing of it.
--   * register_level: the kind of area, in the register's own terms, where
--     the register has several: South Africa's Wine of Origin scheme has
--     geographical units, regions, districts and wards ('overarchingUnit',
--     'unit', 'overarchingRegion', 'region', 'subregion', 'district', 'ward').
--
-- Both are filled by `pnpm kb:load`, which the deploy runs right after
-- migrations.
ALTER TABLE kb_regions ADD COLUMN within TEXT;
ALTER TABLE kb_regions ADD COLUMN register_level TEXT
  CHECK (register_level IS NULL OR register_level IN (
    'overarchingUnit', 'unit', 'overarchingRegion', 'region', 'subregion', 'district', 'ward'
  ));

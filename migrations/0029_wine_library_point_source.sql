-- Where a registered wine name's point on the map comes from: the wine's own
-- Wikidata item ('item'), the area that item lies in ('area', a municipality
-- or a province), or the town the name is taken from ('place'). The last two
-- are approximate, and the page says so.
ALTER TABLE kb_regions ADD COLUMN point_source TEXT
  CHECK (point_source IS NULL OR point_source IN ('item', 'area', 'place'));

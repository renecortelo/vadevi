-- Where a wine was tasted — the place, not the wine's origin.
--
-- The context already records the KIND of place (environment_code: restaurant,
-- bar, winery…). This adds the place itself: its name, and the city, area and
-- country it is in. It belongs to the tasting, so Vicenç can recall where a
-- bottle was drunk, and is deliberately separate from the wine's own region and
-- the producer's location, which it must never be confused with. All nullable
-- additions to tasting_contexts; nothing is rebuilt.
ALTER TABLE tasting_contexts ADD COLUMN venue_name TEXT;
ALTER TABLE tasting_contexts ADD COLUMN venue_city TEXT;
ALTER TABLE tasting_contexts ADD COLUMN venue_area TEXT;
ALTER TABLE tasting_contexts ADD COLUMN venue_country_code TEXT;

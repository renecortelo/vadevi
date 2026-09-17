-- Where the tasting happened, on the map.
--
-- 0018 recorded the place by name — venue, city, area, country. This adds the
-- point itself, so a tasting can be found on a map and two visits to the same
-- bar are recognizably the same bar even when someone typed the name
-- differently. Coordinates are stored to six decimal places (about 0.1 m), which
-- is far finer than a venue needs and is simply what the geocoder returns.
--
-- The point belongs to the TASTING, never to the wine: it is where a bottle was
-- drunk, not where it was grown, and must never be read as the wine's origin.
-- Both columns are nullable additions to tasting_contexts; nothing is rebuilt,
-- and a tasting with no place recorded is unchanged.
ALTER TABLE tasting_contexts ADD COLUMN venue_latitude REAL;
ALTER TABLE tasting_contexts ADD COLUMN venue_longitude REAL;

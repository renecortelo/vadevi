-- An event's place on the map.
--
-- A tasting session already records where it happens as free text
-- (`venue_text`). This adds the point, the same pair a tasting note has carried
-- since 0019, so an event resolved through the geocoder can be opened on a map
-- rather than read as a string someone typed.
--
-- The point belongs to the EVENT — where people met — and has nothing to do with
-- where any of the wines poured there came from. Both columns are nullable
-- additions; nothing is rebuilt, and an event with no place recorded is
-- unchanged.
ALTER TABLE tasting_sessions ADD COLUMN venue_latitude REAL;
ALTER TABLE tasting_sessions ADD COLUMN venue_longitude REAL;

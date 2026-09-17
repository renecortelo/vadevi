-- Where a wine's region is, on the map.
--
-- A wine records its region as text ("Empordà", "Ribera del Duero"); the map
-- needs a point. Regions repeat heavily across a cellar, and a region's location
-- is public and identical for everyone, so this is a shared cache keyed by the
-- normalized region name rather than a per-wine or per-Space column: geocode
-- "Rioja" once, and every Rioja in every cellar is placed.
--
-- latitude/longitude are nullable on purpose: a row with both null is a region
-- the geocoder was asked about and had nothing for, remembered so it is not
-- asked again on every map open. geocoded_at dates the lookup for any later
-- refresh.
CREATE TABLE region_points (
  normalized_region TEXT PRIMARY KEY,
  display_region TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  geocoded_at TEXT NOT NULL,
  CHECK (geocoded_at GLOB '????-??-??T??:??:??.???Z')
);

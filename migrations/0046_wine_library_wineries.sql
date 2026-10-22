-- Wineries the producer field suggests as the reader types: name, country
-- and point, from Wikidata (CC0). Written by `pnpm kb:load`, which the deploy
-- runs right after migrations; only suggested, never imposed — any producer
-- can still be typed.
CREATE TABLE kb_wineries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  latitude REAL,
  longitude REAL
);
CREATE INDEX idx_kb_wineries_country ON kb_wineries(country_code);

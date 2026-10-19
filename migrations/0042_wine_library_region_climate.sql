-- A registered name's card shows its climate and its vineyards' size: the
-- monthly means at its point and what they make (Köppen–Geiger class, yearly
-- rain, Winkler's degree days), and the planted area and production its
-- article's infobox gives, each with its source. Both are JSON written by
-- `pnpm kb:load`, which the deploy runs right after migrations. Two columns
-- added in place: nothing is rebuilt.
ALTER TABLE kb_regions ADD COLUMN climate TEXT;
ALTER TABLE kb_regions ADD COLUMN figures TEXT;

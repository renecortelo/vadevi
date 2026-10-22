-- A registered name's card shows the soil at its point: clay, silt and sand,
-- pH in water and organic carbon in the top 30 cm (SoilGrids 2.0, ISRIC,
-- CC BY 4.0). JSON written by `pnpm kb:load`, which the deploy runs right
-- after migrations. One column added in place: nothing is rebuilt.
ALTER TABLE kb_regions ADD COLUMN soil TEXT;

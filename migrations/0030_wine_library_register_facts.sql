-- What a registered wine name's single document (its technical file, or the
-- Official Journal where the register holds none) says of its wines: the
-- categories of grapevine product it covers, by their number in Annex VII,
-- Part II of Regulation (EU) No 1308/2013, and its main grape varieties as the
-- document writes them, each linked to a grape card where that is certain.
-- Kept as JSON on the region's own row: they are read only with it, and a
-- table of their own would cost a write per variety at every load.
ALTER TABLE kb_regions ADD COLUMN register_categories TEXT;
ALTER TABLE kb_regions ADD COLUMN register_grapes TEXT;
ALTER TABLE kb_regions ADD COLUMN register_source_url TEXT;

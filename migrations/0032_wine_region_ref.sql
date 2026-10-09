-- Which registered wine name a wine's region is, beside the region as it was
-- typed: the library's id for it (kb_regions.id), set when the typed region
-- names one registered name for certain. A wine shows a linked region as the
-- library names it in the reader's language, and keeps what was typed. The
-- grapes have had the same link since 0003: wine_grapes.grape_code, now filled
-- with the library's grape id.
ALTER TABLE wine_records ADD COLUMN region_ref TEXT;

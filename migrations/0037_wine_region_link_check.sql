-- Which build of the wine library a wine's region was last read against,
-- when the region named no registered name for certain.
--
-- A wine is linked to its registered name (region_ref, since 0032) when it is
-- recorded or edited. A wine recorded before the library knew its name — a
-- country added since, a new way of reading a label ("Rioja DOCa") — stayed
-- unlinked. The scheduled handler now reads the unlinked wines again, a batch
-- at a time, against each new build (kb_meta 'version'), and links those that
-- now name one registered name; it never changes a link already made.
ALTER TABLE wine_records ADD COLUMN region_ref_checked TEXT;

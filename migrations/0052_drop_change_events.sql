-- The change log goes (D-06, 16 Nov 2026).
--
-- `change_events` was meant as the feed for an incremental offline sync. Every
-- mutation wrote a row, and only `/sync` read them back, but no client applied
-- what it returned: the offline copy refreshes from the Wine Memory list. It
-- never recorded a deletion, so it could not have been that feed without a
-- redesign. The release before this one stopped writing and reading it; with
-- no code left that touches it, the table and its index are dropped. A copy of
-- the production database was exported first.
DROP INDEX IF EXISTS idx_change_events_space_seq;
DROP TABLE change_events;

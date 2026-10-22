-- A grape's fact may be said of one place's wine rather than of the variety
-- everywhere: the wine of a single-variety DOC as its specification describes
-- it, or the wine of the region where nearly all of the grape is grown. The
-- card says so beside the fact ("said of the wine of Tokaj") and links the
-- place. `place` is its name as the source gives it; `place_id`, the atlas
-- entry, where the place is a registered name. Written by `pnpm kb:load`,
-- which the deploy runs right after migrations. Two columns added in place.
ALTER TABLE kb_evidence ADD COLUMN place TEXT;
ALTER TABLE kb_evidence ADD COLUMN place_id TEXT;

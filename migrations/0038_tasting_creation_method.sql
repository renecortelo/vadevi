-- How a tasting note was first written: by hand, or from a spoken
-- description (voice tastings, P18). It records the note's origin, never its
-- quality, and editing the note never changes it. More ways of writing one
-- (a photograph, a scanned sheet) may come; the values are fixed by the API
-- contract rather than a CHECK here, so adding one needs no table rebuild.
-- Every note written before this is a note written by hand.
ALTER TABLE tasting_notes ADD COLUMN creation_method TEXT NOT NULL DEFAULT 'manual';

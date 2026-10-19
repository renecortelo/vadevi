-- A grape's card shows two more scales beside acidity, tannin and body: the
-- alcohol its wines typically reach, and how dry or sweet they are (a range,
-- "dry-sweet", where its sources give both). Each comes with its quote in
-- kb_evidence like the others. Written by `pnpm kb:load`, which the deploy
-- runs right after migrations. Two columns added in place: nothing is rebuilt.
ALTER TABLE kb_grapes ADD COLUMN alcohol TEXT CHECK (alcohol IS NULL OR alcohol IN ('low', 'medium', 'high'));
ALTER TABLE kb_grapes ADD COLUMN sweetness TEXT;

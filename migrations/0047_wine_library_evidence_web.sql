-- A grape's fact may come from a page that is not openly licensed — a
-- producer's, a merchant's, an interprofessional body's — under the operator's
-- rule of the fact alone: the value and the link are shown, never the page's
-- sentence (`fact_only`; the build still checks the sentence word for word
-- against its own copy). `publisher` names who says it. A fact a grape takes
-- from its single-variety wines (`basis` = 'producers') is held only when at
-- least three producers say the same of theirs; `wines` lists them as JSON,
-- `[{ "producer", "wine", "sourceUrl" }]`, and the card says «according to the
-- wines of three producers». Written by `pnpm kb:load`, which the deploy runs
-- right after migrations. Four columns added in place.
ALTER TABLE kb_evidence ADD COLUMN fact_only INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kb_evidence ADD COLUMN basis TEXT;
ALTER TABLE kb_evidence ADD COLUMN wines TEXT;
ALTER TABLE kb_evidence ADD COLUMN publisher TEXT;

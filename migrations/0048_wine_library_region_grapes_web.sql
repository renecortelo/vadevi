-- A region's grapes may come from its own body's page — Wine Growers British
-- Columbia, VQA Ontario, Wines of South Africa — under the operator's rule of
-- the fact alone: the grapes and the link are shown, never the page's sentence
-- (the build still checks it word for word against its own copy). `publisher`
-- names the body; null for a grape quoted from an openly licensed source.
-- Written by `pnpm kb:load`, which the deploy runs right after migrations.
ALTER TABLE kb_region_grapes ADD COLUMN publisher TEXT;

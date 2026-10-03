-- The wine library, browsed: styles and methods, and pictures.
--
-- A topic is a kind of wine ("orange wine"), a way of growing it ("organic"),
-- a way of making it ("malolactic fermentation") or a concept ("terroir").
-- Its names in every language go in kb_names and its explanation in
-- kb_summaries, under entity_type 'style', which those tables already allow.
CREATE TABLE kb_topics (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('kind', 'farming', 'method', 'concept')),
  wikidata_id TEXT NOT NULL,
  prominence INTEGER NOT NULL CHECK (prominence >= 0)
);

-- One picture per entry, copied into the app, with what its licence asks to
-- be shown beside it: the author, the licence and where it came from.
CREATE TABLE kb_images (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('grape', 'region', 'style')),
  entity_id TEXT NOT NULL,
  path TEXT NOT NULL,
  author TEXT NOT NULL,
  license TEXT NOT NULL,
  license_url TEXT,
  source_url TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

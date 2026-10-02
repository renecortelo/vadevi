-- The wine library's vocabulary: aromas and foods in the eight locales.
--
-- The sources name an aroma a dozen ways ("cherries", "fresh red cherries");
-- the build maps each to one term, and this table holds that term's label in
-- every language the application speaks. Curated by the project: these are
-- translations of common words, not claims about any wine.

CREATE TABLE kb_terms (
  kind TEXT NOT NULL CHECK (kind IN ('aroma', 'pairing')),
  term TEXT NOT NULL,
  locale TEXT NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (kind, term, locale)
);

-- The language a fact's prose was written in, and its translations.
--
-- Researched prose — web curiosities, pairing notes, the composed narrative —
-- was translated once, at research time, into the language the reader had on
-- that day, and stored as the fact itself. Switching the interface to another
-- language then changed every label on the evidence page and none of the
-- evidence: the paragraph could be regenerated, which wrote a new one in the
-- new language, but the curiosities and pairings stayed as they were.
--
-- The fact keeps its text in the language it was written in, now recorded. What
-- a reader in another language sees is a translation of it, made on first read
-- and kept here, so the record is translated once per language rather than on
-- every visit and never rewritten in place.

ALTER TABLE facts ADD COLUMN locale TEXT;

CREATE TABLE fact_translations (
  fact_id TEXT NOT NULL REFERENCES facts(id),
  locale TEXT NOT NULL,
  value_json TEXT NOT NULL,
  -- A web note leads with its page title; that is translated with it.
  source_title TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (fact_id, locale)
);

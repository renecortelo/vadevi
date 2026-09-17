-- Widen the wine types a bottle may carry (vermouth red and white, and whatever
-- comes next) without a migration each time. The value is pinned by a column
-- CHECK on wine_type, and SQLite can only change a CHECK by rebuilding the table
-- — which D1 cannot do here: wine_records is referenced by several tables, so the
-- implicit delete a DROP performs trips their foreign keys, and the one PRAGMA
-- that would defer the checks is not honoured over D1's API.
--
-- So the type moves to a new, unconstrained column beside the old one. Adding a
-- column and copying into it touches no foreign key. The application reads the
-- new column, falling back to the old one for any row not yet rewritten, and
-- writes only the new one — leaving the CHECK'd column untouched and NULL on new
-- rows. The old column stays as it is; nothing needs to drop it.
ALTER TABLE wine_records ADD COLUMN wine_type_free TEXT;

UPDATE wine_records SET wine_type_free = wine_type WHERE wine_type IS NOT NULL;

CREATE INDEX idx_wine_records_space_type_free
  ON wine_records(space_id, wine_type_free, updated_at DESC, id);

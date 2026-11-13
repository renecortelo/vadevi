-- A personal Space was created with the account's default locale, English,
-- before its owner had chosen a language; onboarding saved the choice on the
-- user and left the Space in English. From now on the request that completes
-- onboarding gives the personal Space that language too. This carries the
-- same rule back to the Spaces already created: a personal Space still in
-- English and never edited since (version 1), whose owner finished onboarding
-- in another language, takes that language. A Space someone has edited keeps
-- what it has.
UPDATE spaces
SET default_locale = (
    SELECT users.preferred_locale FROM users WHERE users.id = spaces.created_by_user_id
  ),
  version = version + 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE type = 'personal'
  AND version = 1
  AND deleted_at IS NULL
  AND default_locale = 'en'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE users.id = spaces.created_by_user_id
      AND users.deleted_at IS NULL
      AND users.onboarding_completed_at IS NOT NULL
      AND users.preferred_locale <> 'en'
  );

-- A spoken note the reader chose to send for review, so voice tastings can be
-- corrected on real use: what was heard (as corrected), what the app
-- proposed, and the form as the reader left it. Never the audio. Only when the
-- reader presses the button for that note, and kept thirty days
-- (docs/privacy-review-voice-tasting.md); the scheduled handler removes what
-- has expired, and deleting a Space or an account removes its rows.

CREATE TABLE voice_reviews (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  form TEXT NOT NULL CHECK (form IN ('quick', 'deep', 'wine')),
  locale TEXT NOT NULL CHECK (length(locale) BETWEEN 2 AND 10),
  transcript TEXT NOT NULL CHECK (length(transcript) BETWEEN 1 AND 6000),
  proposal_json TEXT NOT NULL CHECK (json_valid(proposal_json)),
  form_json TEXT NOT NULL CHECK (json_valid(form_json)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_voice_reviews_expires ON voice_reviews(expires_at);
CREATE INDEX idx_voice_reviews_user_created ON voice_reviews(user_id, created_at);

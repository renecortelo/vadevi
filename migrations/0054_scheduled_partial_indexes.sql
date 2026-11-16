-- What the scheduled run looks for, indexed by itself (P-06).
--
-- Three searches for expired rows read a whole table to find the few they act
-- on, usually none: two in the scheduled run, and one that also runs before
-- every read of an action draft. A partial index holds only those rows, so
-- each run reads what it will act on and not the rest.
--
-- Photographs reserved and never uploaded, or rejected, are removed once they
-- expire. The only index on `media_assets` starts with the Space, which a
-- search across every Space cannot use, so each run read every photograph.
CREATE INDEX idx_media_assets_pending_expiry
  ON media_assets (expires_at)
  WHERE processing_status IN ('reserved', 'rejected');

-- Wines whose region is not yet linked to a registered name are read against
-- each new build of the library. Linked wines are the great majority and are
-- never read again; each run still read them all to skip them.
CREATE INDEX idx_wine_records_unlinked_region
  ON wine_records (region_ref_checked)
  WHERE region_ref IS NULL AND region IS NOT NULL AND deleted_at IS NULL;

-- An action draft's payload and summary are cleared once it expires unanswered.
-- The clearing runs in the scheduled run and before every read of a draft, so
-- an expired one is never served; it searched across every user's drafts, and
-- the only index starts with the user.
CREATE INDEX idx_action_drafts_pending_content
  ON action_drafts (expires_at)
  WHERE confirmed_at IS NULL AND canceled_at IS NULL
    AND (payload_json IS NOT NULL OR summary IS NOT NULL);

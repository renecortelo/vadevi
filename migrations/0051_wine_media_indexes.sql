-- Two ways into `wine_media` that its primary key (wine_id, media_id) does
-- not serve.
--
-- A wine's first photo — in the memory list, the wine's own card and a
-- tasting session's wines — is the link with the lowest sort_order, then the
-- oldest. Without an index in that order SQLite went the other way round: for
-- each wine it read every ready photo of the Space, looked each up in the
-- link table and sorted the matches in a temporary B-tree, so the work grew
-- with wines × photos. With this index it reads the wine's links in order and
-- stops at the first ready one.
CREATE INDEX idx_wine_media_wine_order ON wine_media (wine_id, sort_order, created_at, media_id);

-- And the other direction: whether a photo is linked to any wine at all. The
-- scheduled clean-up of expired uploads (the Worker's cron) asks it of every
-- candidate photo, and each question read the whole link table.
CREATE INDEX idx_wine_media_media ON wine_media (media_id);

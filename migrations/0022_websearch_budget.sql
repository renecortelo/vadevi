-- Open-web search gets a daily budget of its own, `websearch_calls`, because
-- Brave is the only provider in the research flow that bills and a cap tight
-- enough for it would throttle the free lookups it used to share a metric with.
--
-- The metric was added to the application on 2026-09-17 without this migration,
-- and every research run since then has failed: the reservation for the new
-- metric tripped this CHECK, the route answered 500, and the reader saw "the
-- research could not be completed" while `research_lookups` — reserved a step
-- earlier — quietly counted a lookup that never happened. Found by the manual
-- acceptance run, which is what it is for. The CHECK is widened here the same
-- way 0013 widened it for OCR: rebuild, copy, swap. This table is referenced by
-- no foreign key, so the rebuild is safe on D1.
DROP INDEX idx_usage_counters_date_metric;

CREATE TABLE usage_counters_next (
  usage_date TEXT NOT NULL CHECK (length(usage_date) = 10),
  scope TEXT NOT NULL CHECK (scope IN ('global', 'space', 'user')),
  scope_id TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN (
    'ai_language_calls', 'research_lookups', 'barcode_lookups', 'price_lookups', 'ocr_reads',
    'websearch_calls'
  )),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (usage_date, scope, scope_id, metric)
);

INSERT INTO usage_counters_next (usage_date, scope, scope_id, metric, used, created_at, updated_at)
SELECT usage_date, scope, scope_id, metric, used, created_at, updated_at FROM usage_counters;

DROP TABLE usage_counters;

ALTER TABLE usage_counters_next RENAME TO usage_counters;

CREATE INDEX idx_usage_counters_date_metric
  ON usage_counters(usage_date, metric);

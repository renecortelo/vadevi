-- Voice tastings get a daily budget of their own, `voice_transcriptions`
-- (planned: docs/privacy-review-voice-tasting.md). The metric CHECK has made
-- every new budget a table rebuild, and once (0022) a forgotten one broke a
-- feature for weeks; this rebuild is the last. The metrics are fixed by the
-- application's `UsageMetric` type and the API contract, as the atlas's kinds
-- of area became in 0036. Rebuild, copy, swap, as 0013 and 0022 did: this
-- table is referenced by no foreign key, so the rebuild is safe on D1.
DROP INDEX idx_usage_counters_date_metric;

CREATE TABLE usage_counters_next (
  usage_date TEXT NOT NULL CHECK (length(usage_date) = 10),
  scope TEXT NOT NULL CHECK (scope IN ('global', 'space', 'user')),
  scope_id TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (length(metric) BETWEEN 1 AND 60),
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

PRAGMA foreign_keys = ON;

CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  wine_id TEXT NOT NULL REFERENCES wine_records(id),
  purchaser_user_id TEXT NOT NULL REFERENCES users(id),
  merchant_name TEXT NOT NULL,
  merchant_url TEXT,
  location_text TEXT,
  purchased_at TEXT NOT NULL,
  unit_amount_minor INTEGER NOT NULL CHECK (unit_amount_minor >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  evidence_media_id TEXT REFERENCES media_assets(id),
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE bottles (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  wine_id TEXT NOT NULL REFERENCES wine_records(id),
  purchase_id TEXT REFERENCES purchases(id),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL CHECK (state IN ('owned', 'opened', 'finished', 'gifted', 'removed')),
  storage_location_text TEXT,
  acquired_at TEXT NOT NULL,
  opened_at TEXT,
  finished_at TEXT,
  gifted_at TEXT,
  removed_at TEXT,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE wishlist_items (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  wine_id TEXT NOT NULL REFERENCES wine_records(id),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  priority INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 3),
  target_amount_minor INTEGER CHECK (target_amount_minor IS NULL OR target_amount_minor >= 0),
  target_currency TEXT CHECK (
    target_currency IS NULL OR (length(target_currency) = 3 AND target_currency = upper(target_currency))
  ),
  referrer TEXT,
  source_id TEXT REFERENCES sources(id),
  notes TEXT,
  state TEXT NOT NULL CHECK (state IN ('active', 'purchased', 'dismissed')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (
    (target_amount_minor IS NULL AND target_currency IS NULL)
    OR (target_amount_minor IS NOT NULL AND target_currency IS NOT NULL)
  )
);

CREATE TABLE price_observations (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  wine_id TEXT NOT NULL REFERENCES wine_records(id),
  observer_user_id TEXT REFERENCES users(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
  merchant_name TEXT,
  merchant_url TEXT,
  location_text TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('physical', 'online', 'unknown')),
  vintage_match TEXT NOT NULL CHECK (vintage_match IN ('yes', 'no', 'unknown')),
  source_type TEXT NOT NULL CHECK (
    source_type IN ('purchase', 'receipt', 'shelf', 'open_prices', 'merchant', 'search')
  ),
  source_id TEXT REFERENCES sources(id),
  evidence_media_id TEXT REFERENCES media_assets(id),
  purchase_id TEXT REFERENCES purchases(id),
  observed_at TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE action_drafts (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (
    action IN ('create_wine_log', 'create_tasting_note', 'add_wishlist_item', 'record_price_observation')
  ),
  payload_json TEXT,
  payload_hash TEXT NOT NULL,
  summary TEXT,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  canceled_at TEXT,
  confirmation_resource_type TEXT,
  confirmation_resource_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (confirmed_at IS NULL OR canceled_at IS NULL)
);

ALTER TABLE assistant_tool_runs RENAME TO assistant_tool_runs_phase4;

CREATE TABLE assistant_tool_runs (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL,
  tool_name TEXT NOT NULL CHECK (tool_name IN (
    'search_memory', 'get_wine_context', 'get_taste_profile', 'compare_wines',
    'research_wine', 'find_price_observations', 'build_recommendation', 'create_action_draft'
  )),
  arguments_hash TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (
    outcome IN ('ok', 'not_found', 'insufficient_data', 'forbidden', 'error')
  ),
  result_count INTEGER NOT NULL CHECK (result_count >= 0),
  citation_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(citation_ids_json)),
  provider TEXT NOT NULL,
  model_version TEXT,
  rule_version TEXT NOT NULL,
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  created_at TEXT NOT NULL
);

INSERT INTO assistant_tool_runs (
  id, space_id, actor_user_id, turn_id, tool_name, arguments_hash,
  outcome, result_count, citation_ids_json, provider, model_version,
  rule_version, latency_ms, created_at
)
SELECT
  id, space_id, actor_user_id, turn_id, tool_name, arguments_hash,
  outcome, result_count, citation_ids_json, provider, model_version,
  rule_version, latency_ms, created_at
FROM assistant_tool_runs_phase4;

DROP TABLE assistant_tool_runs_phase4;

CREATE UNIQUE INDEX idx_wishlist_active_wine
  ON wishlist_items(space_id, wine_id)
  WHERE state = 'active' AND deleted_at IS NULL;
CREATE INDEX idx_purchases_space_date
  ON purchases(space_id, purchased_at DESC, id);
CREATE INDEX idx_bottles_space_state_wine
  ON bottles(space_id, state, wine_id);
CREATE INDEX idx_wishlist_space_state_priority
  ON wishlist_items(space_id, state, priority, updated_at DESC);
CREATE INDEX idx_prices_space_wine_observed
  ON price_observations(space_id, wine_id, observed_at DESC, id);
CREATE INDEX idx_action_drafts_user_expiry
  ON action_drafts(user_id, space_id, expires_at);
CREATE INDEX idx_assistant_tool_runs_space_created
  ON assistant_tool_runs(space_id, created_at DESC);
CREATE INDEX idx_assistant_tool_runs_actor_created
  ON assistant_tool_runs(actor_user_id, created_at DESC);

CREATE UNIQUE INDEX idx_spaces_active_personal_creator
  ON spaces(created_by_user_id)
  WHERE type = 'personal' AND deleted_at IS NULL;

CREATE TABLE change_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  resource_version INTEGER NOT NULL CHECK (resource_version >= 1),
  changed_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  space_id TEXT REFERENCES spaces(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  safe_metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_change_events_space_seq
  ON change_events(space_id, seq);
CREATE INDEX idx_audit_events_space_created
  ON audit_events(space_id, created_at);

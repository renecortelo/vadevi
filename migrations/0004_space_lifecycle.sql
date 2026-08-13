CREATE TABLE idempotency_keys (
  user_id TEXT NOT NULL REFERENCES users(id),
  route_scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body_hash TEXT,
  resource_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, route_scope, key_hash)
);

CREATE INDEX idx_idempotency_keys_expiry
  ON idempotency_keys(expires_at);

CREATE INDEX idx_space_memberships_space_status_role
  ON space_memberships(space_id, status, role, user_id);

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  firebase_uid TEXT NOT NULL UNIQUE,
  email_normalized TEXT,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  preferred_locale TEXT NOT NULL CHECK (
    preferred_locale IN ('ca', 'es', 'fr', 'en', 'it', 'pt-PT', 'nl', 'de')
  ),
  active_space_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (created_at GLOB '????-??-??T??:??:??.???Z'),
  CHECK (updated_at GLOB '????-??-??T??:??:??.???Z')
);

CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('personal', 'couple', 'group')),
  name TEXT NOT NULL,
  default_locale TEXT NOT NULL CHECK (
    default_locale IN ('ca', 'es', 'fr', 'en', 'it', 'pt-PT', 'nl', 'de')
  ),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE space_memberships (
  space_id TEXT NOT NULL REFERENCES spaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed', 'left')),
  joined_at TEXT NOT NULL,
  removed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (space_id, user_id)
);

CREATE TABLE space_invitations (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  token_hash TEXT NOT NULL UNIQUE,
  intended_role TEXT NOT NULL CHECK (intended_role IN ('admin', 'member')),
  email_hash TEXT,
  invited_by_user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  accepted_by_user_id TEXT REFERENCES users(id),
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_space_memberships_active_user
  ON space_memberships(user_id, status, space_id);
CREATE INDEX idx_space_invitations_space_expiry
  ON space_invitations(space_id, expires_at);

-- This relationship is deferred until both rows exist during the idempotent bootstrap transaction.
-- D1/SQLite cannot add the desired foreign key after table creation, so services must ensure that
-- users.active_space_id is null or an active membership owned by that user.

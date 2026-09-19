-- Who may sign in, when a deployment is private.
--
-- Until now a valid Firebase token was enough: any Google account that reached
-- the sign-in screen got an account and a personal Space on its first request.
-- That is the right default for someone who deploys the public source for
-- themselves, and the wrong one for a deployment meant for a few named people,
-- where a link that gets forwarded is a stranger with a cellar and a share of
-- the daily AI budget.
--
-- With ACCESS_MODE=allowlist, a principal whose e-mail is not here (and is not
-- an administrator named in ADMIN_EMAILS) is refused with 403 before any
-- account is created. The list is kept by an administrator from the app.

CREATE TABLE allowed_accounts (
  email_normalized TEXT PRIMARY KEY,
  note TEXT,
  added_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK (email_normalized = lower(email_normalized)),
  CHECK (created_at GLOB '????-??-??T??:??:??.???Z')
);

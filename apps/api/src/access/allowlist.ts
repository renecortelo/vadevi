import type { FirebasePrincipal, WorkerBindings } from "../types";

/**
 * Whether a deployment is private, and who keeps its door.
 *
 * Authentication says who someone is; this says whether they may come in. The
 * two are kept apart on purpose: a valid token from this Firebase project used
 * to be the whole test, which meant any Google account that reached the
 * sign-in screen got an account and a personal Space on its first request. A
 * deployment for a few named people needs the second question asked.
 *
 * `open` is the default and what the public source ships with, so someone who
 * deploys it for themselves is not locked out of their own instance before
 * they have made a list. `allowlist` is set per deployment, in the
 * deployment's own configuration, never in the repository.
 *
 * Unset means open; any other spelling — "allowlst", "private", "true" —
 * means the operator meant to close the door and did not, and is `invalid`:
 * the door then fails closed for everyone, with a code that says why, rather
 * than reading a typo as permission for the world.
 */
export function accessMode(bindings: WorkerBindings): "allowlist" | "invalid" | "open" {
  const mode = bindings.ACCESS_MODE?.trim() ?? "";
  if (mode === "" || mode === "open") return "open";
  return mode === "allowlist" ? "allowlist" : "invalid";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The administrators, as normalized e-mails. Empty when none are configured. */
export function adminEmails(bindings: WorkerBindings): ReadonlySet<string> {
  return new Set(
    (bindings.ADMIN_EMAILS ?? "")
      .split(",")
      .map((entry) => normalizeEmail(entry))
      .filter((entry) => entry.length > 0),
  );
}

/**
 * The e-mail this principal may be authorized by: the one on the token, and
 * only if the identity provider vouched for it. Google's tokens always do.
 * A provider that lets someone sign up with an address they do not own —
 * e-mail and password, say, before the confirmation link is clicked — hands
 * out tokens with `email_verified: false`, and such a token must never match
 * an administrator or an entry on the list. That the Firebase project has
 * only Google enabled today is a setting; this holds whatever the setting.
 */
function authorizingEmail(principal: FirebasePrincipal): string | null {
  if (principal.email === undefined || !principal.emailVerified) return null;
  return normalizeEmail(principal.email);
}

export function isAdmin(bindings: WorkerBindings, principal: FirebasePrincipal): boolean {
  const email = authorizingEmail(principal);
  return email !== null && adminEmails(bindings).has(email);
}

/**
 * Whether this principal may use the deployment.
 *
 * An administrator always may — the list must never be able to lock out the
 * person who keeps it. Anyone else needs an e-mail on the list; a token that
 * carries no e-mail, or an unverified one, cannot be matched and is refused.
 */
export async function isAllowed(
  database: D1Database,
  bindings: WorkerBindings,
  principal: FirebasePrincipal,
): Promise<boolean> {
  const mode = accessMode(bindings);
  if (mode === "open") return true;
  if (mode === "invalid") return false;
  const email = authorizingEmail(principal);
  if (email === null) return false;
  if (isAdmin(bindings, principal)) return true;
  const row = await database
    .prepare(`SELECT 1 AS allowed FROM allowed_accounts WHERE email_normalized = ?`)
    .bind(email)
    .first<{ allowed: number }>();
  return row !== null;
}

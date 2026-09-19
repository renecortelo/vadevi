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
 */
export function accessMode(bindings: WorkerBindings): "allowlist" | "open" {
  return bindings.ACCESS_MODE === "allowlist" ? "allowlist" : "open";
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

export function isAdmin(bindings: WorkerBindings, principal: FirebasePrincipal): boolean {
  return (
    principal.email !== undefined && adminEmails(bindings).has(normalizeEmail(principal.email))
  );
}

/**
 * Whether this principal may use the deployment.
 *
 * An administrator always may — the list must never be able to lock out the
 * person who keeps it. Anyone else needs an e-mail on the list; a token that
 * carries no e-mail at all cannot be matched and is refused.
 */
export async function isAllowed(
  database: D1Database,
  bindings: WorkerBindings,
  principal: FirebasePrincipal,
): Promise<boolean> {
  if (accessMode(bindings) === "open") return true;
  if (principal.email === undefined) return false;
  if (isAdmin(bindings, principal)) return true;
  const row = await database
    .prepare(`SELECT 1 AS allowed FROM allowed_accounts WHERE email_normalized = ?`)
    .bind(normalizeEmail(principal.email))
    .first<{ allowed: number }>();
  return row !== null;
}

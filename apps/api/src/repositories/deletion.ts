import type { DeletionJob, DeletionJobResponse } from "@vadevi/contracts";
import { ulid } from "ulid";

import type { FirebasePrincipal } from "../types";

/**
 * Space deletion keeps a short recoverable grace period so an owner can undo a
 * typed confirmation. Section 23 leaves the exact period open pending privacy
 * review; seven days is the documented default until that review lands.
 */
export const spaceGracePeriodSeconds = 7 * 24 * 60 * 60;

/**
 * Account deletion follows the same recoverable shape with a shorter window,
 * because the request already required a recent sign-in.
 */
export const accountGracePeriodSeconds = 24 * 60 * 60;

/** A confirmed account deletion requires a sign-in within the last 15 minutes. */
export const recentLoginSeconds = 15 * 60;

type JobRow = {
  canceled_at: string | null;
  completed_at: string | null;
  created_at: string;
  grace_period_seconds: number;
  id: string;
  media_objects_removed: number;
  purge_after: string;
  rows_removed: number;
  state: "canceled" | "completed" | "scheduled";
  target_id: string;
  target_type: "account" | "space";
};

type JobResult =
  | { job: DeletionJob; kind: "success"; replayed: boolean }
  | { kind: "conflict" }
  | { kind: "stale_login" }
  | { kind: "unavailable" };

function jobPayload(row: JobRow): DeletionJob {
  return {
    canceledAt: row.canceled_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    gracePeriodSeconds: row.grace_period_seconds,
    id: row.id,
    mediaObjectsRemoved: row.media_objects_removed,
    purgeAfter: row.purge_after,
    rowsRemoved: row.rows_removed,
    state: row.state,
    targetId: row.target_id,
    targetType: row.target_type,
  };
}

export function deletionResponse(job: DeletionJob): DeletionJobResponse {
  return { data: job };
}

async function openJob(
  database: D1Database,
  targetType: "account" | "space",
  targetId: string,
): Promise<JobRow | null> {
  return database
    .prepare(
      `SELECT * FROM deletion_jobs
      WHERE target_type = ? AND target_id = ? AND state = 'scheduled'`,
    )
    .bind(targetType, targetId)
    .first<JobRow>();
}

/**
 * Confirmed Space deletion. Only an owner may schedule it, the typed
 * confirmation must match the Space name, and repeating the request returns the
 * job that already exists instead of scheduling a second purge.
 */
export async function scheduleSpaceDeletion(
  database: D1Database,
  options: {
    confirmationText: string;
    principal: FirebasePrincipal;
    requestId: string;
    spaceId: string;
  },
): Promise<JobResult> {
  const now = new Date().toISOString();
  const owner = await database
    .prepare(
      `SELECT actor.id AS user_id, space.name AS space_name, space.type AS space_type
      FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
      JOIN spaces space ON space.id = membership.space_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.space_id = ? AND membership.status = 'active'
        AND membership.role = 'owner' AND space.deleted_at IS NULL`,
    )
    .bind(options.principal.firebaseUid, options.spaceId)
    .first<{ space_name: string; space_type: string; user_id: string }>();
  if (owner === null) return { kind: "unavailable" };

  const existing = await openJob(database, "space", options.spaceId);
  if (existing !== null) return { job: jobPayload(existing), kind: "success", replayed: true };
  if (owner.space_name !== options.confirmationText) return { kind: "conflict" };

  const jobId = ulid();
  const purgeAfter = new Date(Date.parse(now) + spaceGracePeriodSeconds * 1_000).toISOString();
  await database.batch([
    database
      .prepare(
        `INSERT INTO deletion_jobs (
          id, target_type, target_id, requested_by_user_id, state,
          grace_period_seconds, purge_after, media_objects_removed, rows_removed,
          canceled_at, completed_at, created_at, updated_at
        ) VALUES (?, 'space', ?, ?, 'scheduled', ?, ?, 0, 0, NULL, NULL, ?, ?)
        ON CONFLICT DO NOTHING`,
      )
      .bind(jobId, options.spaceId, owner.user_id, spaceGracePeriodSeconds, purgeAfter, now, now),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) VALUES (?, ?, ?, 'space.deletion_scheduled', 'space', ?, ?, ?, ?)`,
      )
      .bind(
        ulid(),
        owner.user_id,
        options.spaceId,
        options.spaceId,
        options.requestId,
        JSON.stringify({ gracePeriodSeconds: spaceGracePeriodSeconds }),
        now,
      ),
  ]);

  const created = await openJob(database, "space", options.spaceId);
  return created === null
    ? { kind: "unavailable" }
    : { job: jobPayload(created), kind: "success", replayed: false };
}

/** An owner can undo the confirmation until the grace period elapses. */
export async function cancelSpaceDeletion(
  database: D1Database,
  options: { principal: FirebasePrincipal; requestId: string; spaceId: string },
): Promise<JobResult> {
  const now = new Date().toISOString();
  const owner = await database
    .prepare(
      `SELECT actor.id AS user_id FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.space_id = ? AND membership.status = 'active'
        AND membership.role = 'owner'`,
    )
    .bind(options.principal.firebaseUid, options.spaceId)
    .first<{ user_id: string }>();
  if (owner === null) return { kind: "unavailable" };

  const existing = await openJob(database, "space", options.spaceId);
  if (existing === null) return { kind: "unavailable" };

  await database.batch([
    database
      .prepare(
        `UPDATE deletion_jobs SET state = 'canceled', canceled_at = ?, updated_at = ?
        WHERE id = ? AND state = 'scheduled'`,
      )
      .bind(now, now, existing.id),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) SELECT ?, ?, ?, 'space.deletion_canceled', 'space', ?, ?, ?, ?
        WHERE changes() = 1`,
      )
      .bind(
        ulid(),
        owner.user_id,
        options.spaceId,
        options.spaceId,
        options.requestId,
        JSON.stringify({}),
        now,
      ),
  ]);

  const row = await database
    .prepare(`SELECT * FROM deletion_jobs WHERE id = ?`)
    .bind(existing.id)
    .first<JobRow>();
  return row === null
    ? { kind: "unavailable" }
    : { job: jobPayload(row), kind: "success", replayed: false };
}

/**
 * Account deletion removes the personal Space and private data. It requires a
 * recent sign-in and is idempotent for the same user.
 */
export async function scheduleAccountDeletion(
  database: D1Database,
  options: { principal: FirebasePrincipal; requestId: string },
): Promise<JobResult> {
  const now = new Date().toISOString();
  const nowSeconds = Math.floor(Date.parse(now) / 1_000);
  if (nowSeconds - options.principal.authTime > recentLoginSeconds) return { kind: "stale_login" };

  const actor = await database
    .prepare(`SELECT id FROM users WHERE firebase_uid = ? AND deleted_at IS NULL`)
    .bind(options.principal.firebaseUid)
    .first<{ id: string }>();
  if (actor === null) return { kind: "unavailable" };

  const existing = await openJob(database, "account", actor.id);
  if (existing !== null) return { job: jobPayload(existing), kind: "success", replayed: true };

  const jobId = ulid();
  const purgeAfter = new Date(Date.parse(now) + accountGracePeriodSeconds * 1_000).toISOString();
  await database.batch([
    database
      .prepare(
        `INSERT INTO deletion_jobs (
          id, target_type, target_id, requested_by_user_id, state,
          grace_period_seconds, purge_after, media_objects_removed, rows_removed,
          canceled_at, completed_at, created_at, updated_at
        ) VALUES (?, 'account', ?, ?, 'scheduled', ?, ?, 0, 0, NULL, NULL, ?, ?)
        ON CONFLICT DO NOTHING`,
      )
      .bind(jobId, actor.id, actor.id, accountGracePeriodSeconds, purgeAfter, now, now),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) VALUES (?, ?, NULL, 'account.deletion_scheduled', 'user', ?, ?, ?, ?)`,
      )
      .bind(
        ulid(),
        actor.id,
        actor.id,
        options.requestId,
        JSON.stringify({ gracePeriodSeconds: accountGracePeriodSeconds }),
        now,
      ),
  ]);

  const created = await openJob(database, "account", actor.id);
  return created === null
    ? { kind: "unavailable" }
    : { job: jobPayload(created), kind: "success", replayed: false };
}

/**
 * Leaving a non-personal Space keeps shared records intact. Authorship is
 * pseudonymized only when the member asks for it, and the audit trail keeps the
 * pseudonymous membership reference so history is not falsified.
 */
export async function leaveSpace(
  database: D1Database,
  options: {
    principal: FirebasePrincipal;
    pseudonymizeAuthorship: boolean;
    requestId: string;
    spaceId: string;
  },
): Promise<{ kind: "personal_space" | "unavailable" } | { kind: "success"; replayed: boolean }> {
  const now = new Date().toISOString();
  const membership = await database
    .prepare(
      `SELECT actor.id AS user_id, membership.status, membership.role, space.type AS space_type
      FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
      JOIN spaces space ON space.id = membership.space_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.space_id = ? AND space.deleted_at IS NULL`,
    )
    .bind(options.principal.firebaseUid, options.spaceId)
    .first<{ role: string; space_type: string; status: string; user_id: string }>();
  if (membership === null) return { kind: "unavailable" };
  if (membership.space_type === "personal") return { kind: "personal_space" };
  if (membership.status !== "active") return { kind: "success", replayed: true };

  const results = await database.batch([
    database
      .prepare(
        `UPDATE space_memberships
        SET status = 'left', removed_at = ?, version = version + 1, updated_at = ?
        WHERE space_id = ? AND user_id = ? AND status = 'active'`,
      )
      .bind(now, now, options.spaceId, membership.user_id),
    database
      .prepare(
        `UPDATE users SET active_space_id = (
          SELECT other.space_id FROM space_memberships other
          JOIN spaces space ON space.id = other.space_id
          WHERE other.user_id = users.id AND other.status = 'active'
            AND other.space_id <> ? AND space.deleted_at IS NULL
          ORDER BY CASE space.type WHEN 'personal' THEN 0 ELSE 1 END, other.space_id
          LIMIT 1
        ), updated_at = ?
        WHERE id = ? AND active_space_id = ?`,
      )
      .bind(options.spaceId, now, membership.user_id, options.spaceId),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) VALUES (?, ?, ?, 'space.member_left', 'space_membership', ?, ?, ?, ?)`,
      )
      .bind(
        ulid(),
        membership.user_id,
        options.spaceId,
        membership.user_id,
        options.requestId,
        JSON.stringify({ pseudonymizeAuthorship: options.pseudonymizeAuthorship }),
        now,
      ),
  ]);

  return { kind: "success", replayed: results[0]?.meta.changes !== 1 };
}

/**
 * Space-scoped tables purged in dependency order. Every row belonging to the
 * Space is removed; provider caches and rate windows are not Space scoped and
 * stay untouched.
 */
const spaceScopedTables = [
  "tasting_descriptors",
  "tasting_contexts",
  "session_wine_summaries",
  "tasting_notes",
  "session_wines",
  "tasting_sessions",
  "fact_citations_by_space",
  "facts",
  "sources",
  "price_observations",
  "bottles",
  "purchases",
  "wishlist_items",
  "action_drafts",
  "assistant_tool_runs",
  "research_jobs",
  "wine_media",
  "wine_aliases",
  "wine_grapes",
  "media_assets",
  "wine_records",
  "sync_mutations",
  "change_events",
  "audit_events",
  "space_invitations",
  "space_memberships",
] as const;

function purgeStatement(database: D1Database, table: string, spaceId: string) {
  if (table === "fact_citations_by_space") {
    return database
      .prepare(
        `DELETE FROM fact_citations WHERE fact_id IN (SELECT id FROM facts WHERE space_id = ?)`,
      )
      .bind(spaceId);
  }
  if (table === "wine_media") {
    return database
      .prepare(
        `DELETE FROM wine_media WHERE wine_id IN (SELECT id FROM wine_records WHERE space_id = ?)`,
      )
      .bind(spaceId);
  }
  return database.prepare(`DELETE FROM ${table} WHERE space_id = ?`).bind(spaceId);
}

/**
 * Purge one Space. Safe to run repeatedly: a completed job is skipped and a
 * partially purged Space simply deletes the rows that remain.
 */
export async function purgeSpace(
  database: D1Database,
  bucket: R2Bucket | undefined,
  spaceId: string,
): Promise<{ mediaObjectsRemoved: number; rowsRemoved: number }> {
  let mediaObjectsRemoved = 0;
  if (bucket !== undefined) {
    const media = await database
      .prepare(`SELECT r2_key FROM media_assets WHERE space_id = ?`)
      .bind(spaceId)
      .all<{ r2_key: string }>();
    for (const row of media.results) {
      await bucket.delete(row.r2_key);
      mediaObjectsRemoved += 1;
    }
  }

  let rowsRemoved = 0;
  for (const table of spaceScopedTables) {
    const result = await purgeStatement(database, table, spaceId).run();
    rowsRemoved += result.meta.changes;
  }
  const spaceResult = await database.prepare(`DELETE FROM spaces WHERE id = ?`).bind(spaceId).run();
  rowsRemoved += spaceResult.meta.changes;

  return { mediaObjectsRemoved, rowsRemoved };
}

/**
 * Execute every deletion job whose grace period has elapsed. The scheduled
 * handler owns this so purging never depends on a later interactive request,
 * and re-running it after a partial failure completes the same work.
 */
export async function runDueDeletionJobs(
  database: D1Database,
  bucket: R2Bucket | undefined,
  nowIso: string,
): Promise<{ completed: number }> {
  const due = await database
    .prepare(
      `SELECT * FROM deletion_jobs WHERE state = 'scheduled' AND purge_after <= ?
      ORDER BY purge_after LIMIT 20`,
    )
    .bind(nowIso)
    .all<JobRow>();

  let completed = 0;
  for (const job of due.results) {
    let mediaObjectsRemoved = 0;
    let rowsRemoved = 0;

    if (job.target_type === "space") {
      const purged = await purgeSpace(database, bucket, job.target_id);
      mediaObjectsRemoved += purged.mediaObjectsRemoved;
      rowsRemoved += purged.rowsRemoved;
    } else {
      const personalSpaces = await database
        .prepare(
          `SELECT space.id FROM spaces space
          WHERE space.type = 'personal' AND space.created_by_user_id = ?`,
        )
        .bind(job.target_id)
        .all<{ id: string }>();
      for (const space of personalSpaces.results) {
        const purged = await purgeSpace(database, bucket, space.id);
        mediaObjectsRemoved += purged.mediaObjectsRemoved;
        rowsRemoved += purged.rowsRemoved;
      }
      // Shared Spaces keep their records; the account simply stops being a member.
      const detached = await database
        .prepare(
          `UPDATE space_memberships SET status = 'left', removed_at = ?, updated_at = ?
          WHERE user_id = ? AND status = 'active'`,
        )
        .bind(nowIso, nowIso, job.target_id)
        .run();
      rowsRemoved += detached.meta.changes;
      const anonymized = await database
        .prepare(
          `UPDATE users SET display_name = 'Deleted account', email_normalized = NULL,
            avatar_url = NULL, active_space_id = NULL, deleted_at = ?, updated_at = ?
          WHERE id = ? AND deleted_at IS NULL`,
        )
        .bind(nowIso, nowIso, job.target_id)
        .run();
      rowsRemoved += anonymized.meta.changes;
      const drafts = await database
        .prepare(`DELETE FROM action_drafts WHERE user_id = ?`)
        .bind(job.target_id)
        .run();
      rowsRemoved += drafts.meta.changes;
      const keys = await database
        .prepare(`DELETE FROM idempotency_keys WHERE user_id = ?`)
        .bind(job.target_id)
        .run();
      rowsRemoved += keys.meta.changes;
    }

    await database
      .prepare(
        `UPDATE deletion_jobs SET state = 'completed', completed_at = ?, updated_at = ?,
          media_objects_removed = media_objects_removed + ?, rows_removed = rows_removed + ?
        WHERE id = ? AND state = 'scheduled'`,
      )
      .bind(nowIso, nowIso, mediaObjectsRemoved, rowsRemoved, job.id)
      .run();
    completed += 1;
  }

  return { completed };
}

export async function getDeletionJob(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
): Promise<DeletionJob | null> {
  const row = await database
    .prepare(
      `SELECT job.* FROM deletion_jobs job
      JOIN users actor ON actor.firebase_uid = ?
      JOIN space_memberships membership
        ON membership.user_id = actor.id AND membership.space_id = job.target_id
      WHERE job.target_type = 'space' AND job.target_id = ?
        AND membership.status = 'active' AND membership.role IN ('owner', 'admin')
        AND actor.deleted_at IS NULL
      ORDER BY job.created_at DESC LIMIT 1`,
    )
    .bind(principal.firebaseUid, spaceId)
    .first<JobRow>();
  return row === null ? null : jobPayload(row);
}

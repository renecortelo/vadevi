import type { BootstrapResponse, SupportedLocale, UpdateProfileRequest } from "@vadevi/contracts";
import { ulid } from "ulid";

import type { FirebasePrincipal } from "../types";

type BootstrapUserRow = {
  active_space_id: string | null;
  display_name: string;
  id: string;
  onboarding_completed_at: string | null;
  preferred_locale: SupportedLocale;
};

type BootstrapSpaceRow = {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
  type: "personal" | "couple" | "group";
};

export type BootstrapOptions = {
  aiProvider: "none" | "cloudflare";
  principal: FirebasePrincipal;
  requestId: string;
};

export type UpdateProfileOptions = BootstrapOptions & {
  update: UpdateProfileRequest;
};

function initialDisplayName(principal: FirebasePrincipal): string {
  const emailName = principal.email?.split("@", 1)[0]?.trim();
  return (
    principal.displayName ??
    (emailName === undefined || emailName.length === 0 ? "Wine lover" : emailName)
  );
}

export async function bootstrapUser(
  database: D1Database,
  options: BootstrapOptions,
): Promise<BootstrapResponse> {
  const now = new Date().toISOString();
  const candidateUserId = ulid();
  const candidateSpaceId = ulid();
  const auditEventId = ulid();
  const displayName = initialDisplayName(options.principal);
  const locale = "en" satisfies SupportedLocale;

  await database.batch([
    database
      .prepare(
        `INSERT INTO users (
          id, firebase_uid, email_normalized, display_name, avatar_url, preferred_locale,
          active_space_id, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)
        ON CONFLICT(firebase_uid) DO UPDATE SET
          email_normalized = excluded.email_normalized,
          avatar_url = excluded.avatar_url,
          updated_at = excluded.updated_at
        WHERE users.deleted_at IS NULL`,
      )
      .bind(
        candidateUserId,
        options.principal.firebaseUid,
        options.principal.email ?? null,
        displayName,
        options.principal.avatarUrl ?? null,
        locale,
        now,
        now,
      ),
    database
      .prepare(
        `INSERT INTO spaces (
          id, type, name, default_locale, created_by_user_id, version,
          created_at, updated_at, deleted_at
        )
        SELECT ?, 'personal', 'Personal space', u.preferred_locale, u.id, 1, ?, ?, NULL
        FROM users u
        WHERE u.firebase_uid = ?
          AND u.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM spaces existing
            WHERE existing.created_by_user_id = u.id
              AND existing.type = 'personal'
              AND existing.deleted_at IS NULL
          )
        ON CONFLICT DO NOTHING`,
      )
      .bind(candidateSpaceId, now, now, options.principal.firebaseUid),
    database
      .prepare(
        `INSERT INTO space_memberships (
          space_id, user_id, role, status, joined_at, removed_at, version, created_at, updated_at
        )
        SELECT s.id, u.id, 'owner', 'active', ?, NULL, 1, ?, ?
        FROM users u
        JOIN spaces s ON s.created_by_user_id = u.id
        WHERE u.firebase_uid = ?
          AND u.deleted_at IS NULL
          AND s.type = 'personal'
          AND s.deleted_at IS NULL
        ON CONFLICT(space_id, user_id) DO NOTHING`,
      )
      .bind(now, now, now, options.principal.firebaseUid),
    database
      .prepare(
        `UPDATE users
        SET active_space_id = (
          SELECT s.id
          FROM spaces s
          JOIN space_memberships membership ON membership.space_id = s.id
          WHERE membership.user_id = users.id
            AND membership.status = 'active'
            AND s.deleted_at IS NULL
          ORDER BY
            CASE WHEN s.type = 'personal' THEN 0 ELSE 1 END,
            s.created_at,
            s.id
          LIMIT 1
        ), updated_at = ?
        WHERE firebase_uid = ?
          AND deleted_at IS NULL
          AND (
            active_space_id IS NULL OR NOT EXISTS (
              SELECT 1
              FROM space_memberships active_membership
              JOIN spaces active_space ON active_space.id = active_membership.space_id
              WHERE active_membership.user_id = users.id
                AND active_membership.space_id = users.active_space_id
                AND active_membership.status = 'active'
                AND active_space.deleted_at IS NULL
            )
          )`,
      )
      .bind(now, options.principal.firebaseUid),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        )
        SELECT id, 'space', id, 'create', version, ?
        FROM spaces
        WHERE id = ?`,
      )
      .bind(now, candidateSpaceId),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        )
        SELECT ?, u.id, s.id, 'personal_space.created', 'space', s.id, ?, NULL, ?
        FROM users u
        JOIN spaces s ON s.id = ?
        WHERE u.firebase_uid = ?`,
      )
      .bind(auditEventId, options.requestId, now, candidateSpaceId, options.principal.firebaseUid),
  ]);

  return getBootstrapResponse(database, options);
}

export async function getBootstrapResponse(
  database: D1Database,
  options: BootstrapOptions,
): Promise<BootstrapResponse> {
  const user = await database
    .prepare(
      `SELECT id, display_name, preferred_locale, active_space_id, onboarding_completed_at
      FROM users
      WHERE firebase_uid = ? AND deleted_at IS NULL`,
    )
    .bind(options.principal.firebaseUid)
    .first<BootstrapUserRow>();

  if (user === null || user.active_space_id === null) {
    throw new Error("Bootstrap did not produce an active user and Space.");
  }

  const spaces = await database
    .prepare(
      `SELECT s.id, s.name, s.type, membership.role
      FROM spaces s
      JOIN space_memberships membership ON membership.space_id = s.id
      WHERE membership.user_id = ?
        AND membership.status = 'active'
        AND s.deleted_at IS NULL
      ORDER BY CASE WHEN s.id = ? THEN 0 ELSE 1 END, s.name, s.id`,
    )
    .bind(user.id, user.active_space_id)
    .all<BootstrapSpaceRow>();

  return {
    data: {
      features: {
        assistant: options.aiProvider !== "none",
        externalResearch: false,
        priceLookup: false,
        voiceInput: false,
      },
      spaces: spaces.results.map((space) => ({
        id: space.id,
        name: space.name,
        role: space.role,
        type: space.type,
      })),
      user: {
        activeSpaceId: user.active_space_id,
        displayName: user.display_name,
        id: user.id,
        onboardingComplete: user.onboarding_completed_at !== null,
        preferredLocale: user.preferred_locale,
      },
      versions: {
        api: "1",
        i18nCatalog: "2026.1",
        tastingOntology: "2026.1",
      },
    },
  };
}

export async function updateUserProfile(
  database: D1Database,
  options: UpdateProfileOptions,
): Promise<BootstrapResponse | null> {
  const now = new Date().toISOString();
  const auditEventId = ulid();
  const activeSpaceId = options.update.activeSpaceId ?? null;
  const results = await database.batch([
    database
      .prepare(
        `UPDATE users
        SET display_name = COALESCE(?, display_name),
            preferred_locale = COALESCE(?, preferred_locale),
            active_space_id = COALESCE(?, active_space_id),
            onboarding_completed_at = CASE
              WHEN ? = 1 THEN COALESCE(onboarding_completed_at, ?)
              ELSE onboarding_completed_at
            END,
            updated_at = ?
        WHERE firebase_uid = ?
          AND deleted_at IS NULL
          AND (
            ? IS NULL OR EXISTS (
              SELECT 1
              FROM space_memberships membership
              JOIN spaces space ON space.id = membership.space_id
              WHERE membership.user_id = users.id
                AND membership.space_id = ?
                AND membership.status = 'active'
                AND space.deleted_at IS NULL
            )
          )`,
      )
      .bind(
        options.update.displayName ?? null,
        options.update.preferredLocale ?? null,
        activeSpaceId,
        options.update.completeOnboarding === true ? 1 : 0,
        now,
        now,
        options.principal.firebaseUid,
        activeSpaceId,
        activeSpaceId,
      ),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        )
        SELECT active_space_id, 'user_profile', id, 'update', 1, ?
        FROM users
        WHERE firebase_uid = ?
          AND deleted_at IS NULL
          AND active_space_id IS NOT NULL
          AND updated_at = ?`,
      )
      .bind(now, options.principal.firebaseUid, now),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        )
        SELECT ?, id, active_space_id, 'profile.updated', 'user', id, ?, NULL, ?
        FROM users
        WHERE firebase_uid = ?
          AND deleted_at IS NULL
          AND active_space_id IS NOT NULL
          AND updated_at = ?`,
      )
      .bind(auditEventId, options.requestId, now, options.principal.firebaseUid, now),
  ]);

  const updateResult = results[0];
  if (updateResult === undefined || updateResult.meta.changes !== 1) {
    return null;
  }

  return getBootstrapResponse(database, options);
}

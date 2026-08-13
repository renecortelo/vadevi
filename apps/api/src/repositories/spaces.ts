import type {
  BootstrapResponse,
  CreateInvitationRequest,
  CreateInvitationResponse,
  CreateSpaceRequest,
  InvitationPreviewResponse,
  RemoveMemberRequest,
  SpaceDetailResponse,
} from "@vadevi/contracts";
import { ulid } from "ulid";

import { invitationTokenFromIdempotencyKey, sha256Base64Url } from "../security/opaque-token";
import type { FirebasePrincipal } from "../types";
import { getBootstrapResponse, type BootstrapOptions } from "./bootstrap";

type CommandOptions = {
  principal: FirebasePrincipal;
  requestId: string;
};

type CreateSpaceOptions = CommandOptions & {
  idempotencyKey: string;
  request: CreateSpaceRequest;
};

type CreateInvitationOptions = CommandOptions & {
  idempotencyKey: string;
  request: CreateInvitationRequest;
  spaceId: string;
};

type AcceptInvitationOptions = BootstrapOptions & {
  token: string;
};

type RemoveMemberOptions = CommandOptions & {
  memberId: string;
  request: RemoveMemberRequest;
  spaceId: string;
};

type SpaceRow = {
  default_locale: SpaceDetailResponse["data"]["space"]["defaultLocale"];
  id: string;
  name: string;
  role: SpaceDetailResponse["data"]["space"]["role"];
  type: SpaceDetailResponse["data"]["space"]["type"];
  version: number;
};

type MemberRow = {
  display_name: string;
  id: string;
  joined_at: string;
  role: SpaceDetailResponse["data"]["members"][number]["role"];
  version: number;
};

type IdempotencyRow = {
  request_hash: string;
  resource_id: string;
};

type InvitationRow = {
  expires_at: string;
  id: string;
  intended_role: CreateInvitationResponse["data"]["intendedRole"];
  space_id: string;
};

type InvitationPreviewRow = {
  expires_at: string;
  intended_role: InvitationPreviewResponse["data"]["intendedRole"];
  inviter_display_name: string;
  space_name: string;
  space_type: InvitationPreviewResponse["data"]["spaceType"];
};

type MembershipAuthorizationRow = {
  actor_role: "admin" | "owner";
  target_role: "admin" | "member" | "owner";
  target_version: number;
};

export type IdempotentCommandResult<T> =
  | { kind: "conflict" }
  | { kind: "success"; replayed: boolean; response: T }
  | { kind: "unavailable" };

export type InvitationAcceptanceResult =
  { kind: "invalid" } | { kind: "success"; response: BootstrapResponse };

export type RemoveMemberResult =
  | { kind: "conflict" }
  | { kind: "success"; response: SpaceDetailResponse }
  | { kind: "unavailable" };

function plusHours(timestamp: string, hours: number): string {
  return new Date(new Date(timestamp).getTime() + hours * 60 * 60 * 1_000).toISOString();
}

export async function getSpaceDetail(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
): Promise<SpaceDetailResponse | null> {
  const space = await database
    .prepare(
      `SELECT space.id, space.name, space.type, space.default_locale, space.version,
        actor_membership.role
      FROM spaces space
      JOIN space_memberships actor_membership ON actor_membership.space_id = space.id
      JOIN users actor ON actor.id = actor_membership.user_id
      WHERE space.id = ?
        AND space.deleted_at IS NULL
        AND actor.firebase_uid = ?
        AND actor.deleted_at IS NULL
        AND actor_membership.status = 'active'`,
    )
    .bind(spaceId, principal.firebaseUid)
    .first<SpaceRow>();

  if (space === null) return null;

  const members = await database
    .prepare(
      `SELECT member.id, member.display_name, membership.role, membership.joined_at,
        membership.version
      FROM space_memberships membership
      JOIN users member ON member.id = membership.user_id
      WHERE membership.space_id = ?
        AND membership.status = 'active'
        AND member.deleted_at IS NULL
      ORDER BY
        CASE membership.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
        member.display_name,
        member.id`,
    )
    .bind(spaceId)
    .all<MemberRow>();

  return {
    data: {
      members: members.results.map((member) => ({
        displayName: member.display_name,
        id: member.id,
        joinedAt: member.joined_at,
        role: member.role,
        version: member.version,
      })),
      space: {
        defaultLocale: space.default_locale,
        id: space.id,
        name: space.name,
        role: space.role,
        type: space.type,
        version: space.version,
      },
    },
  };
}

export async function createSpace(
  database: D1Database,
  options: CreateSpaceOptions,
): Promise<IdempotentCommandResult<SpaceDetailResponse>> {
  const now = new Date().toISOString();
  const idempotencyExpiresAt = plusHours(now, 24);
  const candidateSpaceId = ulid();
  const auditEventId = ulid();
  const routeScope = "POST:/api/v1/spaces";
  const keyHash = await sha256Base64Url(options.idempotencyKey);
  const requestHash = await sha256Base64Url(JSON.stringify(options.request));

  const results = await database.batch([
    database
      .prepare(
        `INSERT INTO idempotency_keys (
          user_id, route_scope, key_hash, request_hash, response_status,
          response_body_hash, resource_id, expires_at, created_at
        )
        SELECT id, ?, ?, ?, 201, NULL, ?, ?, ?
        FROM users
        WHERE firebase_uid = ? AND deleted_at IS NULL
        ON CONFLICT(user_id, route_scope, key_hash) DO UPDATE SET
          request_hash = excluded.request_hash,
          response_status = excluded.response_status,
          response_body_hash = excluded.response_body_hash,
          resource_id = excluded.resource_id,
          expires_at = excluded.expires_at,
          created_at = excluded.created_at
        WHERE idempotency_keys.expires_at <= excluded.created_at`,
      )
      .bind(
        routeScope,
        keyHash,
        requestHash,
        candidateSpaceId,
        idempotencyExpiresAt,
        now,
        options.principal.firebaseUid,
      ),
    database
      .prepare(
        `INSERT INTO spaces (
          id, type, name, default_locale, created_by_user_id, version,
          created_at, updated_at, deleted_at
        )
        SELECT ?, ?, ?, ?, actor.id, 1, ?, ?, NULL
        FROM users actor
        JOIN idempotency_keys command ON command.user_id = actor.id
        WHERE actor.firebase_uid = ?
          AND actor.deleted_at IS NULL
          AND command.route_scope = ?
          AND command.key_hash = ?
          AND command.request_hash = ?
          AND command.resource_id = ?
        ON CONFLICT DO NOTHING`,
      )
      .bind(
        candidateSpaceId,
        options.request.type,
        options.request.name,
        options.request.defaultLocale,
        now,
        now,
        options.principal.firebaseUid,
        routeScope,
        keyHash,
        requestHash,
        candidateSpaceId,
      ),
    database
      .prepare(
        `INSERT INTO space_memberships (
          space_id, user_id, role, status, joined_at, removed_at, version,
          created_at, updated_at
        )
        SELECT space.id, actor.id, 'owner', 'active', ?, NULL, 1, ?, ?
        FROM spaces space
        JOIN users actor ON actor.id = space.created_by_user_id
        WHERE space.id = ?
          AND actor.firebase_uid = ?
        ON CONFLICT(space_id, user_id) DO NOTHING`,
      )
      .bind(now, now, now, candidateSpaceId, options.principal.firebaseUid),
    database
      .prepare(
        `UPDATE users
        SET active_space_id = ?, updated_at = ?
        WHERE firebase_uid = ?
          AND deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM space_memberships membership
            WHERE membership.space_id = ?
              AND membership.user_id = users.id
              AND membership.status = 'active'
          )`,
      )
      .bind(candidateSpaceId, now, options.principal.firebaseUid, candidateSpaceId),
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
        SELECT ?, actor.id, space.id, 'space.created', 'space', space.id, ?, ?, ?
        FROM spaces space
        JOIN users actor ON actor.id = space.created_by_user_id
        WHERE space.id = ?
          AND actor.firebase_uid = ?`,
      )
      .bind(
        auditEventId,
        options.requestId,
        JSON.stringify({ spaceType: options.request.type }),
        now,
        candidateSpaceId,
        options.principal.firebaseUid,
      ),
  ]);

  const command = await database
    .prepare(
      `SELECT command.request_hash, command.resource_id
      FROM idempotency_keys command
      JOIN users actor ON actor.id = command.user_id
      WHERE actor.firebase_uid = ?
        AND actor.deleted_at IS NULL
        AND command.route_scope = ?
        AND command.key_hash = ?
        AND command.expires_at > ?`,
    )
    .bind(options.principal.firebaseUid, routeScope, keyHash, now)
    .first<IdempotencyRow>();

  if (command === null) return { kind: "unavailable" };
  if (command.request_hash !== requestHash) return { kind: "conflict" };

  const response = await getSpaceDetail(database, options.principal, command.resource_id);
  if (response === null) return { kind: "unavailable" };

  return {
    kind: "success",
    replayed: results[0]?.meta.changes !== 1,
    response,
  };
}

export async function createInvitation(
  database: D1Database,
  options: CreateInvitationOptions,
): Promise<IdempotentCommandResult<CreateInvitationResponse>> {
  const now = new Date().toISOString();
  const expiresAt = plusHours(now, 7 * 24);
  const idempotencyExpiresAt = plusHours(now, 24);
  const candidateInvitationId = ulid();
  const auditEventId = ulid();
  const routeScope = `POST:/api/v1/spaces/${options.spaceId}/invitations`;
  const keyHash = await sha256Base64Url(options.idempotencyKey);
  const requestHash = await sha256Base64Url(JSON.stringify(options.request));
  const token = await invitationTokenFromIdempotencyKey(
    options.idempotencyKey,
    options.spaceId,
    requestHash,
  );
  const tokenHash = await sha256Base64Url(token);

  const results = await database.batch([
    database
      .prepare(
        `INSERT INTO idempotency_keys (
          user_id, route_scope, key_hash, request_hash, response_status,
          response_body_hash, resource_id, expires_at, created_at
        )
        SELECT actor.id, ?, ?, ?, 201, NULL, ?, ?, ?
        FROM users actor
        JOIN space_memberships actor_membership ON actor_membership.user_id = actor.id
        JOIN spaces space ON space.id = actor_membership.space_id
        WHERE actor.firebase_uid = ?
          AND actor.deleted_at IS NULL
          AND space.id = ?
          AND space.deleted_at IS NULL
          AND space.type IN ('couple', 'group')
          AND actor_membership.status = 'active'
          AND actor_membership.role IN ('owner', 'admin')
          AND (
            space.type = 'group' OR (
              (SELECT COUNT(*) FROM space_memberships active_member
                WHERE active_member.space_id = space.id
                  AND active_member.status = 'active')
              +
              (SELECT COUNT(*) FROM space_invitations pending_invitation
                WHERE pending_invitation.space_id = space.id
                  AND pending_invitation.accepted_at IS NULL
                  AND pending_invitation.revoked_at IS NULL
                  AND pending_invitation.expires_at > ?)
              < 2
            )
          )
        ON CONFLICT(user_id, route_scope, key_hash) DO UPDATE SET
          request_hash = excluded.request_hash,
          response_status = excluded.response_status,
          response_body_hash = excluded.response_body_hash,
          resource_id = excluded.resource_id,
          expires_at = excluded.expires_at,
          created_at = excluded.created_at
        WHERE idempotency_keys.expires_at <= excluded.created_at`,
      )
      .bind(
        routeScope,
        keyHash,
        requestHash,
        candidateInvitationId,
        idempotencyExpiresAt,
        now,
        options.principal.firebaseUid,
        options.spaceId,
        now,
      ),
    database
      .prepare(
        `INSERT INTO space_invitations (
          id, space_id, token_hash, intended_role, email_hash, invited_by_user_id,
          expires_at, accepted_by_user_id, accepted_at, revoked_at, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, NULL, actor.id, ?, NULL, NULL, NULL, ?, ?
        FROM users actor
        JOIN idempotency_keys command ON command.user_id = actor.id
        WHERE actor.firebase_uid = ?
          AND actor.deleted_at IS NULL
          AND command.route_scope = ?
          AND command.key_hash = ?
          AND command.request_hash = ?
          AND command.resource_id = ?
        ON CONFLICT DO NOTHING`,
      )
      .bind(
        candidateInvitationId,
        options.spaceId,
        tokenHash,
        options.request.intendedRole,
        expiresAt,
        now,
        now,
        options.principal.firebaseUid,
        routeScope,
        keyHash,
        requestHash,
        candidateInvitationId,
      ),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        )
        SELECT space_id, 'invitation', id, 'create', 1, ?
        FROM space_invitations
        WHERE id = ?`,
      )
      .bind(now, candidateInvitationId),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        )
        SELECT ?, invitation.invited_by_user_id, invitation.space_id,
          'invitation.created', 'invitation', invitation.id, ?, ?, ?
        FROM space_invitations invitation
        WHERE invitation.id = ?`,
      )
      .bind(
        auditEventId,
        options.requestId,
        JSON.stringify({ intendedRole: options.request.intendedRole }),
        now,
        candidateInvitationId,
      ),
  ]);

  const command = await database
    .prepare(
      `SELECT command.request_hash, command.resource_id
      FROM idempotency_keys command
      JOIN users actor ON actor.id = command.user_id
      JOIN space_memberships actor_membership
        ON actor_membership.user_id = actor.id AND actor_membership.space_id = ?
      WHERE actor.firebase_uid = ?
        AND actor.deleted_at IS NULL
        AND actor_membership.status = 'active'
        AND actor_membership.role IN ('owner', 'admin')
        AND command.route_scope = ?
        AND command.key_hash = ?
        AND command.expires_at > ?`,
    )
    .bind(options.spaceId, options.principal.firebaseUid, routeScope, keyHash, now)
    .first<IdempotencyRow>();

  if (command === null) return { kind: "unavailable" };
  if (command.request_hash !== requestHash) return { kind: "conflict" };

  const invitation = await database
    .prepare(
      `SELECT id, space_id, intended_role, expires_at
      FROM space_invitations
      WHERE id = ? AND space_id = ?`,
    )
    .bind(command.resource_id, options.spaceId)
    .first<InvitationRow>();
  if (invitation === null) return { kind: "unavailable" };

  return {
    kind: "success",
    replayed: results[0]?.meta.changes !== 1,
    response: {
      data: {
        expiresAt: invitation.expires_at,
        id: invitation.id,
        intendedRole: invitation.intended_role,
        invitationPath: `/invitations/${token}`,
        spaceId: invitation.space_id,
      },
    },
  };
}

export async function getInvitationPreview(
  database: D1Database,
  token: string,
): Promise<InvitationPreviewResponse | null> {
  const tokenHash = await sha256Base64Url(token);
  const now = new Date().toISOString();
  const invitation = await database
    .prepare(
      `SELECT invitation.intended_role, invitation.expires_at,
        space.name AS space_name, space.type AS space_type,
        inviter.display_name AS inviter_display_name
      FROM space_invitations invitation
      JOIN spaces space ON space.id = invitation.space_id
      JOIN users inviter ON inviter.id = invitation.invited_by_user_id
      WHERE invitation.token_hash = ?
        AND invitation.accepted_at IS NULL
        AND invitation.revoked_at IS NULL
        AND invitation.expires_at > ?
        AND space.deleted_at IS NULL
        AND space.type IN ('couple', 'group')
        AND inviter.deleted_at IS NULL`,
    )
    .bind(tokenHash, now)
    .first<InvitationPreviewRow>();

  if (invitation === null) return null;
  return {
    data: {
      expiresAt: invitation.expires_at,
      intendedRole: invitation.intended_role,
      inviterDisplayName: invitation.inviter_display_name,
      spaceName: invitation.space_name,
      spaceType: invitation.space_type,
    },
  };
}

export async function acceptInvitation(
  database: D1Database,
  options: AcceptInvitationOptions,
): Promise<InvitationAcceptanceResult> {
  const now = new Date().toISOString();
  const tokenHash = await sha256Base64Url(options.token);
  const auditEventId = ulid();

  await database.batch([
    database
      .prepare(
        `UPDATE space_invitations
        SET accepted_by_user_id = (
              SELECT id FROM users
              WHERE firebase_uid = ? AND deleted_at IS NULL
            ),
            accepted_at = ?,
            updated_at = ?
        WHERE token_hash = ?
          AND accepted_at IS NULL
          AND revoked_at IS NULL
          AND expires_at > ?
          AND EXISTS (
            SELECT 1 FROM users accepting_user
            WHERE accepting_user.firebase_uid = ?
              AND accepting_user.deleted_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM space_memberships existing_membership
                WHERE existing_membership.space_id = space_invitations.space_id
                  AND existing_membership.user_id = accepting_user.id
                  AND existing_membership.status = 'active'
              )
          )
          AND EXISTS (
            SELECT 1 FROM spaces invitation_space
            WHERE invitation_space.id = space_invitations.space_id
              AND invitation_space.deleted_at IS NULL
              AND (
                invitation_space.type = 'group' OR (
                  invitation_space.type = 'couple'
                  AND (SELECT COUNT(*) FROM space_memberships active_member
                    WHERE active_member.space_id = invitation_space.id
                      AND active_member.status = 'active') < 2
                )
              )
          )`,
      )
      .bind(options.principal.firebaseUid, now, now, tokenHash, now, options.principal.firebaseUid),
    database
      .prepare(
        `INSERT INTO space_memberships (
          space_id, user_id, role, status, joined_at, removed_at, version,
          created_at, updated_at
        )
        SELECT invitation.space_id, accepting_user.id, invitation.intended_role,
          'active', ?, NULL, 1, ?, ?
        FROM space_invitations invitation
        JOIN users accepting_user ON accepting_user.id = invitation.accepted_by_user_id
        WHERE invitation.token_hash = ?
          AND invitation.accepted_at = ?
          AND accepting_user.firebase_uid = ?
        ON CONFLICT(space_id, user_id) DO UPDATE SET
          role = excluded.role,
          status = 'active',
          joined_at = excluded.joined_at,
          removed_at = NULL,
          version = space_memberships.version + 1,
          updated_at = excluded.updated_at`,
      )
      .bind(now, now, now, tokenHash, now, options.principal.firebaseUid),
    database
      .prepare(
        `UPDATE users
        SET active_space_id = (
              SELECT invitation.space_id FROM space_invitations invitation
              WHERE invitation.token_hash = ? AND invitation.accepted_at = ?
            ),
            updated_at = ?
        WHERE firebase_uid = ?
          AND deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM space_invitations invitation
            WHERE invitation.token_hash = ?
              AND invitation.accepted_by_user_id = users.id
              AND invitation.accepted_at = ?
          )`,
      )
      .bind(tokenHash, now, now, options.principal.firebaseUid, tokenHash, now),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        )
        SELECT membership.space_id, 'membership', membership.user_id, 'create',
          membership.version, ?
        FROM space_memberships membership
        JOIN space_invitations invitation ON invitation.space_id = membership.space_id
        WHERE invitation.token_hash = ?
          AND invitation.accepted_at = ?
          AND membership.user_id = invitation.accepted_by_user_id`,
      )
      .bind(now, tokenHash, now),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        )
        SELECT ?, invitation.accepted_by_user_id, invitation.space_id,
          'invitation.accepted', 'invitation', invitation.id, ?, NULL, ?
        FROM space_invitations invitation
        WHERE invitation.token_hash = ?
          AND invitation.accepted_at = ?`,
      )
      .bind(auditEventId, options.requestId, now, tokenHash, now),
  ]);

  const accepted = await database
    .prepare(
      `SELECT invitation.id
      FROM space_invitations invitation
      JOIN users accepting_user ON accepting_user.id = invitation.accepted_by_user_id
      WHERE invitation.token_hash = ?
        AND accepting_user.firebase_uid = ?
        AND accepting_user.deleted_at IS NULL`,
    )
    .bind(tokenHash, options.principal.firebaseUid)
    .first<{ id: string }>();
  if (accepted === null) return { kind: "invalid" };

  return {
    kind: "success",
    response: await getBootstrapResponse(database, options),
  };
}

export async function removeMember(
  database: D1Database,
  options: RemoveMemberOptions,
): Promise<RemoveMemberResult> {
  const authorization = await database
    .prepare(
      `SELECT actor_membership.role AS actor_role,
        target_membership.role AS target_role,
        target_membership.version AS target_version
      FROM spaces space
      JOIN space_memberships actor_membership ON actor_membership.space_id = space.id
      JOIN users actor ON actor.id = actor_membership.user_id
      JOIN space_memberships target_membership ON target_membership.space_id = space.id
      WHERE space.id = ?
        AND space.deleted_at IS NULL
        AND space.type IN ('couple', 'group')
        AND actor.firebase_uid = ?
        AND actor.deleted_at IS NULL
        AND actor_membership.status = 'active'
        AND actor_membership.role IN ('owner', 'admin')
        AND target_membership.user_id = ?
        AND target_membership.status = 'active'
        AND target_membership.role <> 'owner'
        AND target_membership.user_id <> actor_membership.user_id`,
    )
    .bind(options.spaceId, options.principal.firebaseUid, options.memberId)
    .first<MembershipAuthorizationRow>();

  if (authorization === null) return { kind: "unavailable" };
  if (authorization.target_version !== options.request.baseVersion) {
    return { kind: "conflict" };
  }

  const now = new Date().toISOString();
  const auditEventId = ulid();
  const results = await database.batch([
    database
      .prepare(
        `UPDATE space_memberships
        SET status = 'removed', removed_at = ?, version = version + 1, updated_at = ?
        WHERE space_id = ?
          AND user_id = ?
          AND status = 'active'
          AND role <> 'owner'
          AND version = ?
          AND EXISTS (
            SELECT 1
            FROM space_memberships actor_membership
            JOIN users actor ON actor.id = actor_membership.user_id
            WHERE actor_membership.space_id = space_memberships.space_id
              AND actor.firebase_uid = ?
              AND actor.deleted_at IS NULL
              AND actor_membership.status = 'active'
              AND actor_membership.role IN ('owner', 'admin')
              AND actor_membership.user_id <> space_memberships.user_id
          )`,
      )
      .bind(
        now,
        now,
        options.spaceId,
        options.memberId,
        options.request.baseVersion,
        options.principal.firebaseUid,
      ),
    database
      .prepare(
        `UPDATE users
        SET active_space_id = (
              SELECT fallback_membership.space_id
              FROM space_memberships fallback_membership
              JOIN spaces fallback_space ON fallback_space.id = fallback_membership.space_id
              WHERE fallback_membership.user_id = users.id
                AND fallback_membership.status = 'active'
                AND fallback_space.deleted_at IS NULL
              ORDER BY
                CASE fallback_space.type WHEN 'personal' THEN 0 ELSE 1 END,
                fallback_space.created_at,
                fallback_space.id
              LIMIT 1
            ),
            updated_at = ?
        WHERE id = ?
          AND active_space_id = ?
          AND EXISTS (
            SELECT 1 FROM space_memberships removed_membership
            WHERE removed_membership.space_id = ?
              AND removed_membership.user_id = users.id
              AND removed_membership.status = 'removed'
              AND removed_membership.updated_at = ?
          )`,
      )
      .bind(now, options.memberId, options.spaceId, options.spaceId, now),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        )
        SELECT space_id, 'membership', user_id, 'update', version, ?
        FROM space_memberships
        WHERE space_id = ?
          AND user_id = ?
          AND status = 'removed'
          AND updated_at = ?`,
      )
      .bind(now, options.spaceId, options.memberId, now),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        )
        SELECT ?, actor.id, removed_membership.space_id,
          'membership.removed', 'user', removed_membership.user_id, ?, NULL, ?
        FROM space_memberships removed_membership
        JOIN users actor ON actor.firebase_uid = ? AND actor.deleted_at IS NULL
        WHERE removed_membership.space_id = ?
          AND removed_membership.user_id = ?
          AND removed_membership.status = 'removed'
          AND removed_membership.updated_at = ?`,
      )
      .bind(
        auditEventId,
        options.requestId,
        now,
        options.principal.firebaseUid,
        options.spaceId,
        options.memberId,
        now,
      ),
  ]);

  if (results[0]?.meta.changes !== 1) return { kind: "conflict" };
  const response = await getSpaceDetail(database, options.principal, options.spaceId);
  return response === null ? { kind: "unavailable" } : { kind: "success", response };
}

import {
  BootstrapResponseSchema,
  CreateInvitationResponseSchema,
  ErrorEnvelopeSchema,
  InvitationPreviewResponseSchema,
  SpaceDetailResponseSchema,
  type BootstrapResponse,
  type SpaceDetailResponse,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

type BootstrapSpace = BootstrapResponse["data"]["spaces"][number];
type DetailMember = SpaceDetailResponse["data"]["members"][number];

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const ownerToken = emulatorIdToken();
const memberToken = emulatorIdToken({
  email: "member@example.test",
  name: "Second Member",
  sub: "firebase-emulator-user-phase-1-member",
});
const outsiderToken = emulatorIdToken({
  email: "outsider@example.test",
  name: "Outsider",
  sub: "firebase-emulator-user-phase-1-outsider",
});

function authorization(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function bootstrap(token: string) {
  const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
    headers: authorization(token),
  });
  expect(response.status).toBe(200);
  return BootstrapResponseSchema.parse(await response.json());
}

async function createSpace(
  token: string,
  type: "couple" | "group",
  name: string,
  idempotencyKey = randomOpaqueToken(),
) {
  const response = await SELF.fetch("https://vadevi.test/api/v1/spaces", {
    body: JSON.stringify({ defaultLocale: "en", name, type }),
    headers: {
      ...authorization(token),
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    method: "POST",
  });
  return { idempotencyKey, response };
}

async function createInvitation(
  token: string,
  spaceId: string,
  intendedRole: "admin" | "member" = "member",
) {
  return SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/invitations`, {
    body: JSON.stringify({ intendedRole }),
    headers: {
      ...authorization(token),
      "Content-Type": "application/json",
      "Idempotency-Key": randomOpaqueToken(),
    },
    method: "POST",
  });
}

describe("Space lifecycle authorization", () => {
  it("creates a Space exactly once for an idempotency key", async () => {
    await bootstrap(ownerToken);
    const command = await createSpace(ownerToken, "group", "Sunday lunch");
    const first = SpaceDetailResponseSchema.parse(await command.response.json());

    expect(command.response.status).toBe(201);
    expect(command.response.headers.get("Idempotency-Replayed")).toBe("false");
    expect(command.response.headers.get("Location")).toBe(`/api/v1/spaces/${first.data.space.id}`);
    expect(first.data.space).toMatchObject({
      name: "Sunday lunch",
      role: "owner",
      type: "group",
    });

    const replay = await createSpace(ownerToken, "group", "Sunday lunch", command.idempotencyKey);
    const replayBody = SpaceDetailResponseSchema.parse(await replay.response.json());

    expect(replay.response.status).toBe(201);
    expect(replay.response.headers.get("Idempotency-Replayed")).toBe("true");
    expect(replayBody.data.space.id).toBe(first.data.space.id);

    const conflict = await createSpace(
      ownerToken,
      "couple",
      "Different command",
      command.idempotencyKey,
    );
    expect(conflict.response.status).toBe(409);
    expect(ErrorEnvelopeSchema.parse(await conflict.response.json()).error.code).toBe(
      "IDEMPOTENCY_CONFLICT",
    );

    const counts = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM spaces WHERE name = 'Sunday lunch') AS spaces,
        (SELECT COUNT(*) FROM audit_events WHERE action = 'space.created') AS audits`,
    ).first<{ audits: number; spaces: number }>();
    expect(counts).toEqual({ audits: 1, spaces: 1 });
  });

  it("keeps invitation tokens hashed and accepts each invitation once", async () => {
    const ownerBootstrap = await bootstrap(ownerToken);
    const created = await createSpace(ownerToken, "group", "Invitation table");
    const space = SpaceDetailResponseSchema.parse(await created.response.json());
    const invitationResponse = await createInvitation(ownerToken, space.data.space.id);
    const invitation = CreateInvitationResponseSchema.parse(await invitationResponse.json());
    const token = invitation.data.invitationPath.split("/").at(-1)!;

    expect(invitationResponse.status).toBe(201);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await env.DB.prepare(
      "SELECT token_hash FROM space_invitations WHERE id = ? AND space_id = ?",
    )
      .bind(invitation.data.id, space.data.space.id)
      .first<{ token_hash: string }>();
    expect(stored?.token_hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(stored?.token_hash).not.toBe(token);

    const previewResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/invitations/${token}/preview`,
    );
    const preview = InvitationPreviewResponseSchema.parse(await previewResponse.json());
    expect(previewResponse.status).toBe(200);
    expect(preview.data).toMatchObject({
      intendedRole: "member",
      inviterDisplayName: ownerBootstrap.data.user.displayName,
      spaceName: "Invitation table",
      spaceType: "group",
    });

    const memberBootstrap = await bootstrap(memberToken);
    const accept = () =>
      SELF.fetch(`https://vadevi.test/api/v1/invitations/${token}/accept`, {
        headers: authorization(memberToken),
        method: "POST",
      });
    const acceptedResponse = await accept();
    const accepted = BootstrapResponseSchema.parse(await acceptedResponse.json());
    expect(acceptedResponse.status).toBe(200);
    expect(accepted.data.user.activeSpaceId).toBe(space.data.space.id);
    expect(accepted.data.spaces[0]).toMatchObject({
      id: space.data.space.id,
      role: "member",
    });

    const replayResponse = await accept();
    expect(replayResponse.status).toBe(200);
    BootstrapResponseSchema.parse(await replayResponse.json());

    const usedPreview = await SELF.fetch(`https://vadevi.test/api/v1/invitations/${token}/preview`);
    expect(usedPreview.status).toBe(404);
    expect(ErrorEnvelopeSchema.parse(await usedPreview.json()).error.code).toBe("INVITE_INVALID");

    const counts = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM space_memberships
          WHERE space_id = ? AND user_id = ? AND status = 'active') AS memberships,
        (SELECT COUNT(*) FROM audit_events
          WHERE action = 'invitation.accepted' AND space_id = ?) AS accept_audits`,
    )
      .bind(space.data.space.id, memberBootstrap.data.user.id, space.data.space.id)
      .first<{ accept_audits: number; memberships: number }>();
    expect(counts).toEqual({ accept_audits: 1, memberships: 1 });

    await bootstrap(outsiderToken);
    const outsiderRead = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${space.data.space.id}`,
      { headers: authorization(outsiderToken) },
    );
    expect(outsiderRead.status).toBe(404);

    const memberInvite = await createInvitation(memberToken, space.data.space.id);
    expect(memberInvite.status).toBe(404);
  });

  it("removes a member immediately and never reactivates a used invitation", async () => {
    await bootstrap(ownerToken);
    const created = await createSpace(ownerToken, "group", "Removal table");
    const space = SpaceDetailResponseSchema.parse(await created.response.json());
    const invitationResponse = await createInvitation(ownerToken, space.data.space.id);
    const invitation = CreateInvitationResponseSchema.parse(await invitationResponse.json());
    const token = invitation.data.invitationPath.split("/").at(-1)!;
    const memberBootstrap = await bootstrap(memberToken);
    await SELF.fetch(`https://vadevi.test/api/v1/invitations/${token}/accept`, {
      headers: authorization(memberToken),
      method: "POST",
    });

    const detailResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${space.data.space.id}`,
      { headers: authorization(ownerToken) },
    );
    const detail = SpaceDetailResponseSchema.parse(await detailResponse.json());
    const target = detail.data.members.find(
      (member: DetailMember) => member.id === memberBootstrap.data.user.id,
    )!;

    const staleRemoval = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${space.data.space.id}/members/${target.id}`,
      {
        body: JSON.stringify({ baseVersion: target.version + 1, status: "removed" }),
        headers: {
          ...authorization(ownerToken),
          "Content-Type": "application/json",
        },
        method: "PATCH",
      },
    );
    expect(staleRemoval.status).toBe(409);
    expect(ErrorEnvelopeSchema.parse(await staleRemoval.json()).error.code).toBe(
      "VERSION_CONFLICT",
    );

    const removeResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${space.data.space.id}/members/${target.id}`,
      {
        body: JSON.stringify({ baseVersion: target.version, status: "removed" }),
        headers: {
          ...authorization(ownerToken),
          "Content-Type": "application/json",
        },
        method: "PATCH",
      },
    );
    const afterRemoval = SpaceDetailResponseSchema.parse(await removeResponse.json());
    expect(removeResponse.status).toBe(200);
    expect(afterRemoval.data.members.map((member: DetailMember) => member.id)).not.toContain(
      target.id,
    );

    const removedRead = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${space.data.space.id}`,
      { headers: authorization(memberToken) },
    );
    expect(removedRead.status).toBe(404);

    const removedBootstrap = await bootstrap(memberToken);
    expect(removedBootstrap.data.user.activeSpaceId).not.toBe(space.data.space.id);
    expect(removedBootstrap.data.spaces.map((entry: BootstrapSpace) => entry.id)).not.toContain(
      space.data.space.id,
    );

    const replay = await SELF.fetch(`https://vadevi.test/api/v1/invitations/${token}/accept`, {
      headers: authorization(memberToken),
      method: "POST",
    });
    const replayBootstrap = BootstrapResponseSchema.parse(await replay.json());
    expect(replay.status).toBe(200);
    expect(replayBootstrap.data.spaces.map((entry: BootstrapSpace) => entry.id)).not.toContain(
      space.data.space.id,
    );

    const membership = await env.DB.prepare(
      `SELECT status FROM space_memberships WHERE space_id = ? AND user_id = ?`,
    )
      .bind(space.data.space.id, target.id)
      .first<{ status: string }>();
    expect(membership?.status).toBe("removed");
  });

  it("rejects expired invitations and enforces the two-member couple rule", async () => {
    await bootstrap(ownerToken);
    await bootstrap(memberToken);
    await bootstrap(outsiderToken);

    const groupCreate = await createSpace(ownerToken, "group", "Expired invitation table");
    const group = SpaceDetailResponseSchema.parse(await groupCreate.response.json());
    const expiredResponse = await createInvitation(ownerToken, group.data.space.id);
    const expired = CreateInvitationResponseSchema.parse(await expiredResponse.json());
    const expiredToken = expired.data.invitationPath.split("/").at(-1)!;
    await env.DB.prepare(
      "UPDATE space_invitations SET expires_at = ? WHERE id = ? AND space_id = ?",
    )
      .bind("2020-01-01T00:00:00.000Z", expired.data.id, group.data.space.id)
      .run();

    const expiredPreview = await SELF.fetch(
      `https://vadevi.test/api/v1/invitations/${expiredToken}/preview`,
    );
    const expiredAccept = await SELF.fetch(
      `https://vadevi.test/api/v1/invitations/${expiredToken}/accept`,
      { headers: authorization(outsiderToken), method: "POST" },
    );
    expect(expiredPreview.status).toBe(404);
    expect(expiredAccept.status).toBe(404);

    const coupleCreate = await createSpace(ownerToken, "couple", "Two glasses");
    const couple = SpaceDetailResponseSchema.parse(await coupleCreate.response.json());
    const coupleInviteResponse = await createInvitation(ownerToken, couple.data.space.id);
    const coupleInvite = CreateInvitationResponseSchema.parse(await coupleInviteResponse.json());
    const coupleToken = coupleInvite.data.invitationPath.split("/").at(-1)!;
    const acceptResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/invitations/${coupleToken}/accept`,
      { headers: authorization(memberToken), method: "POST" },
    );
    expect(acceptResponse.status).toBe(200);

    const overCapacity = await createInvitation(ownerToken, couple.data.space.id);
    expect(overCapacity.status).toBe(404);
  });
});

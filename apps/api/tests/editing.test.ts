import {
  CreateWineResponseSchema,
  WineResponseSchema,
  ErrorEnvelopeSchema,
  SpaceDetailResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * Correcting things after they exist.
 *
 * A bottle logged in a restaurant is logged in a hurry, and a Space named in a
 * hurry stays named that way. Neither could be changed: the only way to fix a
 * wine was to log it again, which leaves two wines where there is one bottle.
 */

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const ownerToken = emulatorIdToken({
  email: "edit-owner@example.test",
  name: "Edit Owner",
  sub: "firebase-emulator-user-edit-owner",
});
const memberToken = emulatorIdToken({
  email: "edit-member@example.test",
  name: "Edit Member",
  sub: "firebase-emulator-user-edit-member",
});

function headers(token: string, idempotencyKey?: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    ...(idempotencyKey === undefined ? {} : { "idempotency-key": idempotencyKey }),
  };
}

function mutate(token: string): Record<string, string> {
  return headers(token, randomOpaqueToken());
}

async function bootstrap(token: string) {
  const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
    headers: headers(token),
  });
  expect(response.status).toBe(200);
  return response.json<{ data: { user: { activeSpaceId: string; id: string } } }>();
}

/** An owned group Space, with the member joined through the real invitation. */
async function sharedSpace(): Promise<string> {
  await bootstrap(ownerToken);
  await bootstrap(memberToken);
  const created = await SELF.fetch("https://vadevi.test/api/v1/spaces", {
    body: JSON.stringify({ defaultLocale: "en", name: "Named In A Hurry", type: "group" }),
    headers: mutate(ownerToken),
    method: "POST",
  });
  expect(created.status).toBe(201);
  const spaceId = SpaceDetailResponseSchema.parse(await created.json()).data.space.id;

  const invitation = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/invitations`, {
    body: JSON.stringify({ intendedRole: "member" }),
    headers: mutate(ownerToken),
    method: "POST",
  });
  expect(invitation.status).toBe(201);
  const token = invitation.headers.get("Location")!.split("/").at(-1)!;
  const accepted = await SELF.fetch(`https://vadevi.test/api/v1/invitations/${token}/accept`, {
    headers: mutate(memberToken),
    method: "POST",
  });
  expect(accepted.status).toBe(200);
  return spaceId;
}

async function createWine(spaceId: string, fields: Record<string, unknown>) {
  const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
    body: JSON.stringify({ identityStatus: "draft", nonVintage: false, ...fields }),
    headers: mutate(ownerToken),
    method: "POST",
  });
  expect(response.status).toBe(201);
  return CreateWineResponseSchema.parse(await response.json()).data.wine;
}

describe("correcting a wine", () => {
  it("changes only the fields it is given, and bumps the version", async () => {
    const spaceId = await sharedSpace();
    const wine = await createWine(spaceId, {
      displayName: "Vinya Mistake",
      producerName: "Celler Sintètic",
      region: "Penedès",
      vintageYear: 2019,
    });

    const patched = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}`,
      {
        body: JSON.stringify({ vintageYear: 2021, version: wine.version }),
        headers: mutate(ownerToken),
        method: "PATCH",
      },
    );
    expect(patched.status).toBe(200);
    const updated = WineResponseSchema.parse(await patched.json()).data.wine;

    expect(updated.vintageYear).toBe(2021);
    // The fields the caller did not mention are the point: a screen that edits
    // one must not clear the others.
    expect(updated.displayName).toBe("Vinya Mistake");
    expect(updated.region).toBe("Penedès");
    expect(updated.version).toBe(wine.version + 1);
  });

  it("refuses a stale version rather than overwriting someone else's edit", async () => {
    const spaceId = await sharedSpace();
    const wine = await createWine(spaceId, {
      displayName: "Vinya Contested",
      producerName: "Celler Sintètic",
    });

    const first = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}`,
      {
        body: JSON.stringify({ producerName: "Celler One", version: wine.version }),
        headers: mutate(ownerToken),
        method: "PATCH",
      },
    );
    expect(first.status).toBe(200);

    // The member still holds the version they read before the owner's edit.
    const second = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}`,
      {
        body: JSON.stringify({ producerName: "Celler Two", version: wine.version }),
        headers: mutate(memberToken),
        method: "PATCH",
      },
    );
    expect(second.status).toBe(409);
    expect(ErrorEnvelopeSchema.parse(await second.json()).error.code).toBe("VERSION_CONFLICT");
  });

  it("is refused from outside the Space", async () => {
    const spaceId = await sharedSpace();
    const wine = await createWine(spaceId, {
      displayName: "Vinya Private",
      producerName: "Celler Sintètic",
    });
    const outsider = emulatorIdToken({
      email: "edit-outsider@example.test",
      name: "Edit Outsider",
      sub: "firebase-emulator-user-edit-outsider",
    });
    await bootstrap(outsider);

    const response = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}`,
      {
        body: JSON.stringify({ displayName: "Taken", version: wine.version }),
        headers: mutate(outsider),
        method: "PATCH",
      },
    );
    // Cross-Space isolation: not "forbidden", which would confirm it exists.
    expect(response.status).toBe(404);
  });
});

describe("renaming a Space", () => {
  it("lets an owner rename it", async () => {
    const spaceId = await sharedSpace();
    const before = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}`, {
      headers: headers(ownerToken),
    });
    const version = SpaceDetailResponseSchema.parse(await before.json()).data.space.version;

    const renamed = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}`, {
      body: JSON.stringify({ name: "Named Properly", version }),
      headers: mutate(ownerToken),
      method: "PATCH",
    });
    expect(renamed.status).toBe(200);
    const space = SpaceDetailResponseSchema.parse(await renamed.json()).data.space;
    expect(space.name).toBe("Named Properly");
    expect(space.version).toBe(version + 1);
  });

  it("refuses a member, because the name is what everyone reads", async () => {
    const spaceId = await sharedSpace();
    const detail = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}`, {
      headers: headers(memberToken),
    });
    const version = SpaceDetailResponseSchema.parse(await detail.json()).data.space.version;

    const attempt = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}`, {
      body: JSON.stringify({ name: "Renamed By A Member", version }),
      headers: mutate(memberToken),
      method: "PATCH",
    });
    expect(attempt.status).toBe(403);
    expect(ErrorEnvelopeSchema.parse(await attempt.json()).error.code).toBe("FORBIDDEN");
  });
});

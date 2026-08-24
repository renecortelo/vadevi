import {
  BootstrapResponseSchema,
  CreateWineResponseSchema,
  ErrorEnvelopeSchema,
  MediaReservationResponseSchema,
  MediaUploadResponseSchema,
  SyncResponseSchema,
  TastingNoteResponseSchema,
  WineMemoryResponseSchema,
  WineResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { ulid } from "ulid";
import { beforeAll, describe, expect, it } from "vitest";

import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const ownerToken = emulatorIdToken({
  email: "memory-owner@example.test",
  name: "Memory Owner",
  sub: "firebase-emulator-user-phase-2-owner",
});
const outsiderToken = emulatorIdToken({
  email: "memory-outsider@example.test",
  name: "Memory Outsider",
  sub: "firebase-emulator-user-phase-2-outsider",
});

function headers(token: string, idempotencyKey?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(idempotencyKey === undefined ? {} : { "Idempotency-Key": idempotencyKey }),
  };
}

async function bootstrap(token: string) {
  const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  return BootstrapResponseSchema.parse(await response.json());
}

async function createWine(
  spaceId: string,
  body: Record<string, unknown>,
  token = ownerToken,
  key = randomOpaqueToken(),
) {
  const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
    body: JSON.stringify(body),
    headers: headers(token, key),
    method: "POST",
  });
  return { key, response };
}

function tinyJpeg(width = 1, height = 1, exif = false): Uint8Array<ArrayBuffer> {
  const bytes = [
    0xff,
    0xd8,
    ...(exif ? [0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00] : []),
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
    0xff,
    0xd9,
  ];
  return new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
}

async function hash(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function reserve(spaceId: string, bytes: Uint8Array<ArrayBuffer>, width = 1, height = 1) {
  const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/media`, {
    body: JSON.stringify({
      byteSize: bytes.byteLength,
      height,
      kind: "label",
      mimeType: "image/jpeg",
      sha256: await hash(bytes),
      width,
    }),
    headers: headers(ownerToken, randomOpaqueToken()),
    method: "POST",
  });
  return { response, reservation: MediaReservationResponseSchema.parse(await response.json()) };
}

describe("Wine Memory and Quick Log", () => {
  it("stores a wine type the old column CHECK would have rejected", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId;
    // "vermouth_red" is not in the legacy wine_type CHECK; it must persist in the
    // free-text column and read back unchanged.
    const created = await createWine(spaceId, {
      displayName: "Vermut de Prueba",
      identityStatus: "confirmed",
      nonVintage: true,
      producerName: "Bodega Vermut",
      wineType: "vermouth_red",
    });
    expect(created.response.status).toBe(201);
    const wine = CreateWineResponseSchema.parse(await created.response.json()).data.wine;
    expect(wine.wineType).toBe("vermouth_red");

    // And it survives a read through the memory list.
    const list = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines?limit=100`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const body = WineMemoryResponseSchema.parse(await list.json());
    expect(
      body.data.some(
        (entry: { id: string; wineType: string | null }) =>
          entry.id === wine.id && entry.wineType === "vermouth_red",
      ),
    ).toBe(true);
  });

  it("creates confirmed wines idempotently and only suggests duplicates", async () => {
    const owner = await bootstrap(ownerToken);
    await bootstrap(outsiderToken);
    const spaceId = owner.data.user.activeSpaceId;
    const request = {
      displayName: "Camins del Priorat",
      identityStatus: "confirmed",
      nonVintage: false,
      producerName: "Bodega Álba de Prueba",
      region: "Priorat",
      vintageYear: 2023,
      wineType: "red",
    };

    const command = await createWine(spaceId, request);
    const first = CreateWineResponseSchema.parse(await command.response.json());
    expect(command.response.status).toBe(201);
    expect(command.response.headers.get("Idempotency-Replayed")).toBe("false");
    expect(first.data.possibleDuplicates).toEqual([]);

    const replay = await createWine(spaceId, request, ownerToken, command.key);
    expect(replay.response.status).toBe(201);
    expect(replay.response.headers.get("Idempotency-Replayed")).toBe("true");
    expect(CreateWineResponseSchema.parse(await replay.response.json()).data.wine.id).toBe(
      first.data.wine.id,
    );

    const conflictingReplay = await createWine(
      spaceId,
      { ...request, vintageYear: 2022 },
      ownerToken,
      command.key,
    );
    expect(conflictingReplay.response.status).toBe(409);

    const duplicateCommand = await createWine(spaceId, request);
    const duplicate = CreateWineResponseSchema.parse(await duplicateCommand.response.json());
    expect(duplicateCommand.response.status).toBe(201);
    expect(duplicate.data.wine.id).not.toBe(first.data.wine.id);
    expect(duplicate.data.possibleDuplicates.map((wine: { id: string }) => wine.id)).toContain(
      first.data.wine.id,
    );

    const memoryResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines?query=alba&limit=1`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    const memory = WineMemoryResponseSchema.parse(await memoryResponse.json());
    expect(memoryResponse.status).toBe(200);
    expect(memory.data).toHaveLength(1);
    expect(memory.page.hasMore).toBe(true);
    expect(memory.page.nextCursor).not.toBeNull();

    const outsiderRead = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    const outsiderWrite = await createWine(spaceId, request, outsiderToken);
    expect(outsiderRead.status).toBe(404);
    expect(outsiderWrite.response.status).toBe(404);
  });

  it("records grape varieties and alcohol on create and replaces them on update", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId;
    const created = await createWine(spaceId, {
      alcoholAbv: 13.5,
      displayName: "Varietal Proof",
      grapes: [{ name: "Tempranillo", percentage: 85 }, { name: "Garnacha" }],
      identityStatus: "confirmed",
      nonVintage: false,
      producerName: "Varietal Estate",
    });
    const wine = CreateWineResponseSchema.parse(await created.response.json()).data.wine;
    expect(wine.alcoholAbv).toBe(13.5);
    expect(wine.grapes).toEqual([
      { name: "Tempranillo", percentage: 85 },
      { name: "Garnacha", percentage: null },
    ]);

    const update = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}`,
      {
        body: JSON.stringify({
          alcoholAbv: 14,
          grapes: [{ name: "Monastrell", percentage: 100 }],
          version: wine.version,
        }),
        headers: headers(ownerToken),
        method: "PATCH",
      },
    );
    expect(update.status).toBe(200);
    const updated = WineResponseSchema.parse(await update.json()).data.wine;
    expect(updated.alcoholAbv).toBe(14);
    // The list replaces wholesale: Tempranillo and Garnacha are gone.
    expect(updated.grapes).toEqual([{ name: "Monastrell", percentage: 100 }]);

    // Clearing the list removes every varietal without touching other fields.
    const cleared = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}`,
      {
        body: JSON.stringify({ grapes: [], version: updated.version }),
        headers: headers(ownerToken),
        method: "PATCH",
      },
    );
    expect(cleared.status).toBe(200);
    const clearedWine = WineResponseSchema.parse(await cleared.json()).data.wine;
    expect(clearedWine.grapes).toEqual([]);
    expect(clearedWine.alcoholAbv).toBe(14);
  });

  it("stores every quick-tasting field under the authenticated author", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId;
    const wineCommand = await createWine(spaceId, {
      displayName: "Restaurant Red",
      identityStatus: "confirmed",
      nonVintage: false,
      producerName: "House Producer",
      vintageYear: 2024,
    });
    const wine = CreateWineResponseSchema.parse(await wineCommand.response.json()).data.wine;
    const key = randomOpaqueToken();
    const request = {
      comment: "Fresh and generous.",
      descriptorCodes: ["fruit.red.cherry", "production.oak.vanilla"],
      foodText: "Lamb",
      mode: "quick",
      score100: 86,
      sentiment: "like",
      state: "submitted",
      tastedAt: "2026-08-13T12:30:00.000Z",
      wineId: wine.id,
      wouldBuy: "yes",
      wouldDrinkAgain: "yes",
    };
    const tasting = () =>
      SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/tasting-notes`, {
        body: JSON.stringify(request),
        headers: headers(ownerToken, key),
        method: "POST",
      });

    const firstResponse = await tasting();
    const first = TastingNoteResponseSchema.parse(await firstResponse.json());
    expect(firstResponse.status).toBe(201);
    expect(first.data).toMatchObject({ ...request, descriptorCodes: expect.any(Array) });
    expect(first.data.descriptorCodes).toEqual(expect.arrayContaining(request.descriptorCodes));
    expect(first.data.descriptorCodes).toHaveLength(request.descriptorCodes.length);
    const replay = await tasting();
    expect(replay.status).toBe(201);
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true");

    const stored = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM tasting_notes WHERE id = ?) AS notes,
        (SELECT COUNT(*) FROM tasting_descriptors WHERE tasting_note_id = ?) AS descriptors,
        (SELECT author_user_id FROM tasting_notes WHERE id = ?) AS author`,
    )
      .bind(first.data.id, first.data.id, first.data.id)
      .first<{ author: string; descriptors: number; notes: number }>();
    expect(stored).toEqual({ author: owner.data.user.id, descriptors: 2, notes: 1 });
  });

  it("replays an offline wine and note exactly once", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId;
    const wineId = ulid();
    const noteId = ulid();
    const body = {
      cursor: null,
      deviceId: ulid(),
      mutations: [
        {
          baseVersion: null,
          mutationId: ulid(),
          occurredAt: "2026-08-13T18:00:00.000Z",
          operation: "create",
          payload: {
            displayName: "Offline Garnatxa",
            identityStatus: "confirmed",
            nonVintage: false,
            producerName: "Restaurant List",
            vintageYear: 2022,
          },
          resourceId: wineId,
          resourceType: "wine_record",
        },
        {
          baseVersion: null,
          mutationId: ulid(),
          occurredAt: "2026-08-13T18:05:00.000Z",
          operation: "create",
          payload: {
            comment: "Saved without a signal.",
            descriptorCodes: ["fruit.red.strawberry"],
            foodText: "Pa amb tomàquet",
            mode: "quick",
            score100: 88,
            sentiment: "like",
            state: "submitted",
            tastedAt: "2026-08-13T18:05:00.000Z",
            wineId,
            wouldBuy: "yes",
            wouldDrinkAgain: "yes",
          },
          resourceId: noteId,
          resourceType: "tasting_note",
        },
      ],
    };
    const sync = () =>
      SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/sync`, {
        body: JSON.stringify(body),
        headers: headers(ownerToken),
        method: "POST",
      });
    const firstResponse = await sync();
    const first = SyncResponseSchema.parse(await firstResponse.json());
    expect(firstResponse.status).toBe(200);
    expect(first.data.mutationResults.map((result: { status: string }) => result.status)).toEqual([
      "applied",
      "applied",
    ]);
    const replayResponse = await sync();
    const replay = SyncResponseSchema.parse(await replayResponse.json());
    expect(replay.data.mutationResults.map((result: { status: string }) => result.status)).toEqual([
      "replayed",
      "replayed",
    ]);

    const conflictingBody = structuredClone(body);
    conflictingBody.mutations[1]!.payload.comment = "A conflicting local edit that must survive.";
    const conflictResponse = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/sync`, {
      body: JSON.stringify(conflictingBody),
      headers: headers(ownerToken),
      method: "POST",
    });
    const conflict = SyncResponseSchema.parse(await conflictResponse.json());
    expect(conflict.data.mutationResults[1]).toMatchObject({
      current: { comment: "Saved without a signal." },
      status: "conflict",
    });

    const counts = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM wine_records WHERE id = ? AND space_id = ?) AS wines,
        (SELECT COUNT(*) FROM tasting_notes WHERE id = ? AND space_id = ?) AS notes`,
    )
      .bind(wineId, spaceId, noteId, spaceId)
      .first<{ notes: number; wines: number }>();
    expect(counts).toEqual({ notes: 1, wines: 1 });
  });

  it("keeps processed label bytes private and rejects unsafe uploads", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId;
    const bytes = tinyJpeg();
    const { reservation } = await reserve(spaceId, bytes);
    expect(JSON.stringify(reservation)).not.toContain("r2_key");
    const storedKey = await env.DB.prepare("SELECT r2_key FROM media_assets WHERE id = ?")
      .bind(reservation.data.media.id)
      .first<{ r2_key: string }>();
    expect(storedKey).not.toBeNull();
    expect(JSON.stringify(reservation)).not.toContain(storedKey!.r2_key);

    const uploadResponse = await SELF.fetch(`https://vadevi.test${reservation.data.uploadPath}`, {
      body: bytes,
      headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "image/jpeg" },
      method: "PUT",
    });
    const uploaded = MediaUploadResponseSchema.parse(await uploadResponse.json());
    expect(uploadResponse.status).toBe(200);
    expect(uploaded.data.media.processingStatus).toBe("ready");

    const ownerRead = await SELF.fetch(`https://vadevi.test${reservation.data.uploadPath}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const outsiderRead = await SELF.fetch(`https://vadevi.test${reservation.data.uploadPath}`, {
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.headers.get("Cache-Control")).toBe("private, no-store");
    expect(ownerRead.headers.get("Content-Disposition")).toBe('inline; filename="image"');
    expect(new Uint8Array(await ownerRead.arrayBuffer())).toEqual(bytes);
    expect(outsiderRead.status).toBe(404);

    const spoofBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]) as Uint8Array<ArrayBuffer>;
    const spoof = await reserve(spaceId, spoofBytes);
    const spoofResponse = await SELF.fetch(
      `https://vadevi.test${spoof.reservation.data.uploadPath}`,
      {
        body: spoofBytes,
        headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "image/jpeg" },
        method: "PUT",
      },
    );
    expect(spoofResponse.status).toBe(400);
    expect(ErrorEnvelopeSchema.parse(await spoofResponse.json()).error.code).toBe("MEDIA_REJECTED");

    const exifBytes = tinyJpeg(1, 1, true);
    const exif = await reserve(spaceId, exifBytes);
    const exifResponse = await SELF.fetch(
      `https://vadevi.test${exif.reservation.data.uploadPath}`,
      {
        body: exifBytes,
        headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "image/jpeg" },
        method: "PUT",
      },
    );
    expect(exifResponse.status).toBe(400);

    const hashBytes = tinyJpeg(2, 1);
    const hashReservation = await reserve(spaceId, hashBytes, 2, 1);
    const changed = new Uint8Array(hashBytes);
    changed[changed.length - 1] = 0x00;
    const hashResponse = await SELF.fetch(
      `https://vadevi.test${hashReservation.reservation.data.uploadPath}`,
      {
        body: changed,
        headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "image/jpeg" },
        method: "PUT",
      },
    );
    expect(hashResponse.status).toBe(400);

    const invalidReservation = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/media`,
      {
        body: JSON.stringify({
          byteSize: 6 * 1024 * 1024,
          height: 4096,
          kind: "label",
          mimeType: "image/png",
          sha256: randomOpaqueToken(),
          width: 4096,
        }),
        headers: headers(ownerToken, randomOpaqueToken()),
        method: "POST",
      },
    );
    expect(invalidReservation.status).toBe(400);
  });
});

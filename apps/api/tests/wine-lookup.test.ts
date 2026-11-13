import {
  BootstrapResponseSchema,
  CreateWineResponseSchema,
  ErrorEnvelopeSchema,
  WineLookupResponseSchema,
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
  email: "lookup-owner@example.test",
  sub: "firebase-emulator-user-lookup-owner",
});
const outsiderToken = emulatorIdToken({
  email: "lookup-outsider@example.test",
  sub: "firebase-emulator-user-lookup-outsider",
});

async function bootstrap(token: string) {
  const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return BootstrapResponseSchema.parse(await response.json()).data;
}

async function lookup(token: string, spaceId: string, query = "") {
  return SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines/lookup${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe("wines to choose from", () => {
  it("gives the picker the label and nothing else, newest first, searched like the list", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.user.activeSpaceId;
    const created: string[] = [];
    for (const wine of [
      { displayName: "Lookup Blanc", producerName: "Celler Un", vintageYear: 2021 },
      { displayName: "Lookup Negre", producerName: "Celler Dos", vintageYear: 2019 },
      { displayName: "Lookup Brut", nonVintage: true, producerName: "Celler Tres" },
      { displayName: "Lookup Esborrat", producerName: "Celler Quatre", vintageYear: 2020 },
    ]) {
      const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
        body: JSON.stringify({
          identityStatus: "confirmed",
          nonVintage: false,
          wineType: "white",
          ...wine,
        }),
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": randomOpaqueToken(),
        },
        method: "POST",
      });
      expect(response.status).toBe(201);
      created.push(CreateWineResponseSchema.parse(await response.json()).data.wine.id);
    }
    const [blanc, negre, brut, deleted] = created as [string, string, string, string];
    // Distinct times, so the order does not hang on two writes in one millisecond.
    for (const [index, id] of created.entries()) {
      await env.DB.prepare(`UPDATE wine_records SET updated_at = ? WHERE id = ?`)
        .bind(`2026-10-0${index + 1}T12:00:00.000Z`, id)
        .run();
    }
    await env.DB.prepare(`UPDATE wine_records SET deleted_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), deleted)
      .run();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO wine_aliases (id, space_id, wine_id, alias, normalized_alias, kind, created_at, updated_at)
      VALUES (?, ?, ?, 'Vi de la Casa', 'vi de la casa', 'display', ?, ?)`,
    )
      .bind(ulid(), spaceId, negre, now, now)
      .run();

    const all = await lookup(ownerToken, spaceId);
    expect(all.status).toBe(200);
    // The schema is strict: a score, a photo or a grape in the answer would fail here.
    const { data } = WineLookupResponseSchema.parse(await all.json());
    expect(data).toEqual([
      {
        displayName: "Lookup Brut",
        id: brut,
        nonVintage: true,
        producerName: "Celler Tres",
        vintageYear: null,
      },
      {
        displayName: "Lookup Negre",
        id: negre,
        nonVintage: false,
        producerName: "Celler Dos",
        vintageYear: 2019,
      },
      {
        displayName: "Lookup Blanc",
        id: blanc,
        nonVintage: false,
        producerName: "Celler Un",
        vintageYear: 2021,
      },
    ]);

    const ids = async (query: string) =>
      WineLookupResponseSchema.parse(
        await (await lookup(ownerToken, spaceId, query)).json(),
      ).data.map((wine) => wine.id);
    expect(await ids("?query=celler%20dos")).toEqual([negre]);
    expect(await ids("?query=Celler%20Un%20Lookup")).toEqual([blanc]);
    expect(await ids("?query=blanc")).toEqual([blanc]);
    expect(await ids("?query=casa")).toEqual([negre]);
    expect(await ids("?query=esborrat")).toEqual([]);
    expect(await ids("?limit=2")).toEqual([brut, negre]);
  });

  it("answers not found outside the reader's Spaces, and refuses a page too large", async () => {
    const owner = await bootstrap(ownerToken);
    await bootstrap(outsiderToken);
    const spaceId = owner.user.activeSpaceId;

    const outside = await lookup(outsiderToken, spaceId);
    expect(outside.status).toBe(404);
    expect(ErrorEnvelopeSchema.parse(await outside.json()).error.code).toBe("NOT_FOUND");

    expect((await lookup(ownerToken, spaceId, "?limit=101")).status).toBe(400);
  });
});

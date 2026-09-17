import { BootstrapResponseSchema, CreateWineResponseSchema } from "@vadevi/contracts";
import type { ImageSearchPort } from "@vadevi/domain";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { ProviderFetcher } from "../src/adapters/provider-fetch";
import { importBottlePhoto, searchBottlePhotos } from "../src/repositories/bottle-photo";
import { randomOpaqueToken } from "../src/security/opaque-token";
import type { FirebasePrincipal } from "../src/types";
import { emulatorIdToken } from "./fixtures/firebase-token";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const ownerUid = "firebase-emulator-user-bottle-photo-owner";
const ownerToken = emulatorIdToken({
  email: "bottle-owner@example.test",
  name: "Bottle Owner",
  sub: ownerUid,
});
const principal: FirebasePrincipal = {
  authTime: Math.floor(Date.now() / 1_000),
  displayName: "Bottle Owner",
  email: "bottle-owner@example.test",
  firebaseUid: ownerUid,
};

function jpegBytes(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
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
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
}

async function bootstrap() {
  const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  return BootstrapResponseSchema.parse(await response.json());
}

async function createWine(spaceId: string) {
  const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
    body: JSON.stringify({
      displayName: "Kiwi Trail",
      identityStatus: "confirmed",
      nonVintage: false,
      producerName: "Southern Cellars",
      vintageYear: 2023,
      wineType: "white",
    }),
    headers: {
      Authorization: `Bearer ${ownerToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": randomOpaqueToken(),
    },
    method: "POST",
  });
  return CreateWineResponseSchema.parse(await response.json()).data.wine;
}

describe("bottle photo import", () => {
  it("downloads a Brave-CDN photo and makes it the wine's main image", async () => {
    const owner = await bootstrap();
    const spaceId = owner.data.user.activeSpaceId!;
    const wine = await createWine(spaceId);

    const bytes = jpegBytes(900, 1200);
    const fetcher: ProviderFetcher = async () =>
      new Response(bytes, {
        headers: { "Content-Length": String(bytes.byteLength), "Content-Type": "image/jpeg" },
      });

    const result = await importBottlePhoto(env.DB, env.MEDIA, {
      fetcher,
      principal,
      sourceUrl: "https://example-wine.test/kiwi",
      spaceId,
      thumbnailUrl: "https://imgs.search.brave.com/kiwi.jpeg",
      title: "Kiwi Trail bottle",
      userAgent: "VaDeVi/0.1 (https://example.test/contact)",
      wineId: wine.id,
    });
    expect(result.kind).toBe("success");
    if (result.kind !== "success") throw new Error("expected success");

    // The wine's primary photo — lowest sort_order — is the imported one, ready.
    const primary = await env.DB.prepare(
      `SELECT link.media_id, media.processing_status, media.mime_type
        FROM wine_media link
        JOIN media_assets media ON media.id = link.media_id
        WHERE link.wine_id = ? ORDER BY link.sort_order, link.created_at LIMIT 1`,
    )
      .bind(wine.id)
      .first<{ media_id: string; mime_type: string; processing_status: string }>();
    expect(primary?.media_id).toBe(result.mediaId);
    expect(primary?.processing_status).toBe("ready");
    expect(primary?.mime_type).toBe("image/jpeg");
    // The bytes were stored in R2.
    const stored = await env.MEDIA.list();
    expect(stored.objects.length).toBeGreaterThan(0);
  });

  it("refuses a thumbnail that is not on the provider's CDN", async () => {
    const owner = await bootstrap();
    const spaceId = owner.data.user.activeSpaceId!;
    const wine = await createWine(spaceId);
    const result = await importBottlePhoto(env.DB, env.MEDIA, {
      fetcher: async () => new Response(jpegBytes(10, 10)),
      principal,
      sourceUrl: "https://example-wine.test/kiwi",
      spaceId,
      thumbnailUrl: "https://cdn.random-host.test/kiwi.jpeg",
      title: "Kiwi",
      userAgent: "VaDeVi/0.1 (https://example.test/contact)",
      wineId: wine.id,
    });
    expect(result).toEqual({ kind: "rejected", reason: "untrusted_host" });
  });

  it("refuses bytes that are not a supported image", async () => {
    const owner = await bootstrap();
    const spaceId = owner.data.user.activeSpaceId!;
    const wine = await createWine(spaceId);
    const result = await importBottlePhoto(env.DB, env.MEDIA, {
      fetcher: async () => new Response(new Uint8Array([0x00, 0x01, 0x02, 0x03])),
      principal,
      sourceUrl: "https://example-wine.test/kiwi",
      spaceId,
      thumbnailUrl: "https://imgs.search.brave.com/kiwi.bin",
      title: "Kiwi",
      userAgent: "VaDeVi/0.1 (https://example.test/contact)",
      wineId: wine.id,
    });
    expect(result).toEqual({ kind: "rejected", reason: "unsupported_format" });
  });

  it("returns candidates from the image search port, scoped to the wine", async () => {
    const owner = await bootstrap();
    const spaceId = owner.data.user.activeSpaceId!;
    const wine = await createWine(spaceId);
    let askedQuery = "";
    const port: ImageSearchPort = {
      search: async ({ query }) => {
        askedQuery = query;
        return {
          cached: false,
          data: [
            {
              sourceUrl: "https://example-wine.test/kiwi",
              thumbnailUrl: "https://imgs.search.brave.com/kiwi.jpeg",
              title: "Kiwi Trail bottle",
            },
          ],
          status: "success",
        };
      },
    };
    const candidates = await searchBottlePhotos(env.DB, port, {
      locale: "es",
      principal,
      spaceId,
      wineId: wine.id,
    });
    expect(candidates).toHaveLength(1);
    expect(askedQuery).toContain("Southern Cellars");
    expect(askedQuery).toContain("Kiwi Trail");
  });
});

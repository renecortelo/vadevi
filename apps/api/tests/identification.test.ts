import {
  BootstrapResponseSchema,
  ConfirmIdentificationResponseSchema,
  CreateWineResponseSchema,
  IdentificationResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const ownerToken = emulatorIdToken({
  email: "identify-owner@example.test",
  name: "Identify Owner",
  sub: "firebase-emulator-user-identification-owner",
});
const outsiderToken = emulatorIdToken({
  email: "identify-outsider@example.test",
  name: "Identify Outsider",
  sub: "firebase-emulator-user-identification-outsider",
});

function headers(token: string, idempotencyKey?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(idempotencyKey === undefined ? {} : { "Idempotency-Key": idempotencyKey }),
  };
}

async function activeSpace(token: string): Promise<string> {
  const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  return BootstrapResponseSchema.parse(await response.json()).data.user.activeSpaceId;
}

async function createWine(spaceId: string, wine: Record<string, unknown>) {
  const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
    body: JSON.stringify({ identityStatus: "confirmed", nonVintage: false, ...wine }),
    headers: headers(ownerToken, randomOpaqueToken()),
    method: "POST",
  });
  expect(response.status).toBe(201);
  return CreateWineResponseSchema.parse(await response.json()).data.wine;
}

async function identify(spaceId: string, body: Record<string, unknown>, token = ownerToken) {
  const response = await SELF.fetch(
    `https://vadevi.test/api/v1/spaces/${spaceId}/identifications`,
    {
      body: JSON.stringify({ locale: "en", ...body }),
      headers: headers(token),
      method: "POST",
    },
  );
  return response;
}

describe("Identification drafts (AC-011, AC-012)", () => {
  it("proposes a high-confidence candidate from a barcode already in the Space", async () => {
    const spaceId = await activeSpace(ownerToken);
    const wine = await createWine(spaceId, {
      barcode: "8412345678905",
      countryCode: "ES",
      displayName: "Scanned Again Red",
      producerName: "Synthetic Scan Producer",
      region: "Rioja",
      vintageYear: 2019,
      wineType: "red",
    });

    const response = await identify(spaceId, { barcode: "8412345678905" });
    expect(response.status).toBe(200);
    const draft = IdentificationResponseSchema.parse(await response.json()).data;

    expect(draft.status).toBe("needs_confirmation");
    expect(Date.parse(draft.expiresAt)).toBeGreaterThan(Date.now());
    const candidate = draft.candidates[0]!;
    expect(candidate.origin).toBe("space_barcode");
    expect(candidate.matchedWineId).toBe(wine.id);
    // A wine the user already confirmed is observed evidence at high confidence.
    expect(candidate.fields.producerName).toMatchObject({
      confidence: "high",
      evidence: "observed",
      value: "Synthetic Scan Producer",
    });
    expect(candidate.fields.vintageYear?.value).toBe(2019);
    // The existing record is offered as a duplicate rather than merged silently.
    expect(candidate.possibleDuplicateWineIds).toContain(wine.id);
  });

  it("matches accent-insensitively on scanned label text", async () => {
    const spaceId = await activeSpace(ownerToken);
    const wine = await createWine(spaceId, {
      displayName: "Clos Montblanc",
      producerName: "Céller Sant Josep",
      vintageYear: 2021,
      wineType: "red",
    });

    // Unaccented OCR output still finds the accented stored producer.
    const response = await identify(spaceId, { scannedText: "celler sant josep clos montblanc" });
    expect(response.status).toBe(200);
    const draft = IdentificationResponseSchema.parse(await response.json()).data;
    expect(
      draft.candidates.some(
        (entry: { matchedWineId: string | null }) => entry.matchedWineId === wine.id,
      ),
    ).toBe(true);
    expect(
      draft.candidates.find(
        (entry: { matchedWineId: string | null; origin: string }) =>
          entry.matchedWineId === wine.id,
      )?.origin,
    ).toBe("space_text");
  });

  it("returns an explicit manual_required draft when nothing matches", async () => {
    const spaceId = await activeSpace(ownerToken);
    const response = await identify(spaceId, { barcode: "1234567890128" });
    expect(response.status).toBe(200);
    const draft = IdentificationResponseSchema.parse(await response.json()).data;

    expect(draft.status).toBe("manual_required");
    expect(draft.candidates).toEqual([]);
    // The disabled provider is reported, not silently ignored.
    expect(draft.warnings.join(" ")).toMatch(/disabled|manually/i);
  });

  it("rejects a request that proposes nothing to work from", async () => {
    const spaceId = await activeSpace(ownerToken);
    const response = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/identifications`,
      { body: JSON.stringify({ locale: "en" }), headers: headers(ownerToken), method: "POST" },
    );
    expect(response.status).toBe(400);
  });

  it("denies identification to an outsider", async () => {
    const spaceId = await activeSpace(ownerToken);
    await activeSpace(outsiderToken);
    const response = await identify(spaceId, { barcode: "8412345678905" }, outsiderToken);
    expect(response.status).toBe(404);
  });
});

describe("Identification confirmation (AC-011)", () => {
  it("creates exactly one wine from the user's corrected values", async () => {
    const spaceId = await activeSpace(ownerToken);
    const started = await identify(spaceId, { manualHint: "A wine not in the Space yet" });
    const draft = IdentificationResponseSchema.parse(await started.json()).data;

    const confirm = () =>
      SELF.fetch(
        `https://vadevi.test/api/v1/spaces/${spaceId}/identifications/${draft.id}/confirm`,
        {
          body: JSON.stringify({
            confirm: true,
            wine: {
              // The user corrected the proposal before saving.
              displayName: "Corrected By Hand",
              identityStatus: "confirmed",
              nonVintage: false,
              producerName: "Synthetic Confirm Producer",
              vintageYear: 2020,
              wineType: "white",
            },
          }),
          headers: headers(ownerToken),
          method: "POST",
        },
      );

    const first = await confirm();
    expect(first.status).toBe(201);
    const created = ConfirmIdentificationResponseSchema.parse(await first.json()).data;
    expect(created.wineId).toBeTruthy();

    // Confirming twice returns the same wine rather than creating a second.
    const replay = await confirm();
    expect(replay.status).toBe(201);
    expect(ConfirmIdentificationResponseSchema.parse(await replay.json()).data.wineId).toBe(
      created.wineId,
    );

    const total = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM wine_records WHERE space_id = ? AND display_name = ?`,
    )
      .bind(spaceId, "Corrected By Hand")
      .first<{ total: number }>();
    expect(total?.total).toBe(1);

    const audit = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM audit_events WHERE space_id = ? AND action = 'wine.identified'`,
    )
      .bind(spaceId)
      .first<{ total: number }>();
    expect(audit?.total).toBe(1);
  });

  it("refuses to confirm an expired draft", async () => {
    const spaceId = await activeSpace(ownerToken);
    const started = await identify(spaceId, { manualHint: "Expiring proposal" });
    const draft = IdentificationResponseSchema.parse(await started.json()).data;

    await env.DB.prepare(`UPDATE identification_drafts SET expires_at = ? WHERE id = ?`)
      .bind("2020-01-01T00:00:00.000Z", draft.id)
      .run();

    const response = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/identifications/${draft.id}/confirm`,
      {
        body: JSON.stringify({
          confirm: true,
          wine: {
            displayName: "Too Late",
            identityStatus: "confirmed",
            nonVintage: false,
            producerName: "Synthetic Confirm Producer",
          },
        }),
        headers: headers(ownerToken),
        method: "POST",
      },
    );
    expect(response.status).toBe(400);
  });

  it("denies confirming another member's draft", async () => {
    const spaceId = await activeSpace(ownerToken);
    const started = await identify(spaceId, { manualHint: "Owner private proposal" });
    const draft = IdentificationResponseSchema.parse(await started.json()).data;

    const response = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/identifications/${draft.id}/confirm`,
      {
        body: JSON.stringify({
          confirm: true,
          wine: {
            displayName: "Stolen Draft",
            identityStatus: "confirmed",
            nonVintage: false,
            producerName: "Synthetic Confirm Producer",
          },
        }),
        headers: headers(outsiderToken),
        method: "POST",
      },
    );
    expect(response.status).toBe(404);
  });
});

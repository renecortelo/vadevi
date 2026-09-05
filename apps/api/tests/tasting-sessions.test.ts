import {
  BootstrapResponseSchema,
  CreateInvitationResponseSchema,
  CreateWineResponseSchema,
  DeepTastingResponseSchema,
  ErrorEnvelopeSchema,
  SessionComparisonResponseSchema,
  SpaceDetailResponseSchema,
  TastingSessionDetailResponseSchema,
  TastingSessionResponseSchema,
  type SessionComparisonResponse,
  type TastingSessionDetailResponse,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { runDeterministicAssistantTurn } from "../src/repositories/assistant";
import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

type ComparisonWine = SessionComparisonResponse["data"]["wines"][number];
type SessionWine = TastingSessionDetailResponse["data"]["wines"][number];

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const ownerToken = emulatorIdToken({
  email: "session-owner@example.test",
  name: "Session Owner",
  sub: "firebase-emulator-user-phase-3-owner",
});
const memberToken = emulatorIdToken({
  email: "session-member@example.test",
  name: "Session Member",
  sub: "firebase-emulator-user-phase-3-member",
});
const outsiderToken = emulatorIdToken({
  email: "session-outsider@example.test",
  name: "Session Outsider",
  sub: "firebase-emulator-user-phase-3-outsider",
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

async function sharedSpace() {
  await bootstrap(ownerToken);
  const createResponse = await SELF.fetch("https://vadevi.test/api/v1/spaces", {
    body: JSON.stringify({ defaultLocale: "en", name: "Ontology table", type: "group" }),
    headers: headers(ownerToken, randomOpaqueToken()),
    method: "POST",
  });
  const created = SpaceDetailResponseSchema.parse(await createResponse.json());
  const spaceId = created.data.space.id;
  const invitationResponse = await SELF.fetch(
    `https://vadevi.test/api/v1/spaces/${spaceId}/invitations`,
    {
      body: JSON.stringify({ intendedRole: "member" }),
      headers: headers(ownerToken, randomOpaqueToken()),
      method: "POST",
    },
  );
  const invitation = CreateInvitationResponseSchema.parse(await invitationResponse.json());
  const token = invitation.data.invitationPath.split("/").at(-1)!;
  await bootstrap(memberToken);
  const acceptResponse = await SELF.fetch(
    `https://vadevi.test/api/v1/invitations/${token}/accept`,
    { headers: { Authorization: `Bearer ${memberToken}` }, method: "POST" },
  );
  expect(acceptResponse.status).toBe(200);
  const outsider = await bootstrap(outsiderToken);
  return { outsider, owner: await bootstrap(ownerToken), spaceId };
}

async function submitDeepNote(
  spaceId: string,
  token: string,
  wineId: string,
  score100: number,
  noseText: string,
) {
  const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/tasting-notes`, {
    body: JSON.stringify({
      acidity: 3,
      descriptors: [],
      mode: "deep",
      noseText,
      score100,
      state: "submitted",
      tanninLevel: 3,
      tastedAt: "2026-08-13T18:00:00.000Z",
      wineId,
    }),
    headers: headers(token, randomOpaqueToken()),
    method: "POST",
  });
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
  return DeepTastingResponseSchema.parse(await response.json()).data;
}

async function createWine(spaceId: string, displayName: string, token = ownerToken) {
  const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
    body: JSON.stringify({
      displayName,
      identityStatus: "confirmed",
      nonVintage: false,
      producerName: "Session Producer",
      vintageYear: 2024,
      wineType: "red",
    }),
    headers: headers(token, randomOpaqueToken()),
    method: "POST",
  });
  expect(response.status).toBe(201);
  return CreateWineResponseSchema.parse(await response.json()).data.wine;
}

async function createDeepNote(
  spaceId: string,
  token: string,
  wineId: string,
  sessionWineId: string,
  score100: number,
) {
  const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/tasting-notes`, {
    body: JSON.stringify({
      acidity: 4,
      alcoholPerception: 3,
      appearanceClarity: "clear",
      appearanceColorFamily: "red",
      appearanceHue: "ruby",
      appearanceIntensity: 4,
      appearanceText: `${score100} appearance`,
      balance: 4,
      beadSize: "fine",
      body: 4,
      effervescence: 4,
      complexity: 4,
      conclusionText: `${score100} conclusion`,
      context: {
        aerationMinutes: 20,
        ambientSmellLevel: 2,
        bottleCondition: "sound",
        decanted: true,
        environment: "class",
        foodText: "Bread",
        glass: "tulip",
        lightLevel: 4,
        minutesOpen: 30,
        noiseLevel: 1,
        openedState: "open",
        palateCleanser: "Water",
        preservationMethod: "none",
        roomTemperatureTenthsC: 210,
        servingTemperatureTenthsC: 160,
        venueArea: "Catalunya",
        venueCity: "Barcelona",
        venueCountryCode: "ES",
        venueName: "Casa de Prueba",
      },
      descriptors: [
        { code: "fruit.red.cherry", intensity: 4, phase: "nose" },
        { code: `score.${score100}`, intensity: 3, phase: "palate" },
      ],
      expectationResult: "above",
      finishLength: 4,
      flavorIntensity: 4,
      memorable: true,
      mode: "deep",
      noseCondition: "clean",
      noseDevelopment: 3,
      noseFreshness: 4,
      noseIntensity: 4,
      noseText: `${score100} nose`,
      noseSwirledIntensity: 5,
      noseSwirledText: `${score100} swirled`,
      pairingSuccess: 4,
      palateText: `${score100} palate`,
      palateTexture: "round",
      perceivedValue: 4,
      rimEvolution: 2,
      score100,
      sentiment: "like",
      sessionWineId,
      state: "draft",
      sweetness: 2,
      tanninLevel: 3,
      tanninTexture: "fine",
      tastedAt: "2026-08-13T18:00:00.000Z",
      tastingConfidence: 4,
      viscosity: 3,
      wineId,
      wouldBuy: "yes",
      wouldDrinkAgain: "yes",
    }),
    headers: headers(token, randomOpaqueToken()),
    method: "POST",
  });
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(201);
  return DeepTastingResponseSchema.parse(body).data;
}

describe("Deep tasting and collaborative sessions", () => {
  it("shares group members' scores with Vicenç but keeps their written notes private", async () => {
    const { spaceId } = await sharedSpace();
    const wine = await createWine(spaceId, "Group Shared Red");
    await submitDeepNote(spaceId, ownerToken, wine.id, 88, "owner-private-nose-observation");
    await submitDeepNote(spaceId, memberToken, wine.id, 92, "member-private-nose-observation");

    let captured: Array<{ evidenceClass: string; text: string }> = [];
    await runDeterministicAssistantTurn(env.DB, {
      aiProvider: "cloudflare",
      externalResearch: false,
      language: {
        render: async (input) => {
          captured = input.statements;
          return { claims: [], modelVersion: "@cf/example/model" };
        },
      },
      pairing: null,
      principal: {
        authTime: Math.floor(Date.now() / 1_000),
        displayName: "Session Owner",
        email: "session-owner@example.test",
        firebaseUid: "firebase-emulator-user-phase-3-owner",
      },
      request: {
        context: { allowedCrossSpaceIds: [], visibleWineId: null },
        locale: "en",
        message: "What did the group think of Group Shared Red?",
        saveHistory: false,
        threadId: null,
      },
      requestId: randomOpaqueToken(),
      semanticNotes: null,
      spaceId,
    });
    const all = captured.map((statement) => statement.text).join(" || ");
    // Both members' SCORES reach Vicenç, the peer's attributed by name.
    expect(all).toContain("you rated it 88");
    expect(all).toContain("Session Member rated it 92");
    // The reader's own written note travels; the other member's never does.
    expect(all).toContain("owner-private-nose-observation");
    expect(all).not.toContain("member-private-nose-observation");
    // And a peer's shared note is an observation, not folded into "your" record.
    const peer = captured.find((statement) => statement.text.includes("Session Member"));
    expect(peer?.evidenceClass).toBe("observed");
  }, 30_000);

  it("keeps notes separate, round-trips structured fields, and compares submitted notes", async () => {
    const { outsider, owner, spaceId } = await sharedSpace();
    const firstWine = await createWine(spaceId, "First Flight Wine");
    const secondWine = await createWine(spaceId, "Second Flight Wine");
    const sessionResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/sessions`,
      {
        body: JSON.stringify({
          description: "A deterministic comparison",
          name: "Thursday flight",
          startsAt: "2026-08-13T18:00:00.000Z",
          status: "active",
          venueText: "Home",
        }),
        headers: headers(ownerToken, randomOpaqueToken()),
        method: "POST",
      },
    );
    expect(sessionResponse.status).toBe(201);
    const session = TastingSessionResponseSchema.parse(await sessionResponse.json()).data;
    const addResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/sessions/${session.id}/wines`,
      {
        body: JSON.stringify({
          entries: [{ wineId: firstWine.id }, { servingLabel: "B", wineId: secondWine.id }],
        }),
        headers: headers(ownerToken, randomOpaqueToken()),
        method: "POST",
      },
    );
    const flight = TastingSessionDetailResponseSchema.parse(await addResponse.json());
    expect(addResponse.status).toBe(200);
    expect(flight.data.wines.map((entry: SessionWine) => entry.position)).toEqual([0, 1]);

    const reorderResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/sessions/${session.id}/wines/order`,
      {
        body: JSON.stringify({
          orderedSessionWineIds: [flight.data.wines[1]!.id, flight.data.wines[0]!.id],
        }),
        headers: headers(ownerToken),
        method: "PUT",
      },
    );
    const reordered = TastingSessionDetailResponseSchema.parse(await reorderResponse.json());
    expect(reordered.data.wines.map((entry: SessionWine) => entry.wine.id)).toEqual([
      secondWine.id,
      firstWine.id,
    ]);
    const sessionWineId = reordered.data.wines[1]!.id;

    const ownerNote = await createDeepNote(spaceId, ownerToken, firstWine.id, sessionWineId, 90);
    const memberNote = await createDeepNote(spaceId, memberToken, firstWine.id, sessionWineId, 80);
    expect(ownerNote.id).not.toBe(memberNote.id);
    expect(ownerNote.authorUserId).toBe(owner.data.user.id);
    expect(ownerNote).toMatchObject({
      acidity: 4,
      appearanceHue: "ruby",
      context: { environment: "class", servingTemperatureTenthsC: 160 },
      descriptors: expect.arrayContaining([
        { code: "fruit.red.cherry", intensity: 4, phase: "nose" },
      ]),
      noseText: "90 nose",
      ontologyVersion: "2026.1",
      palateTexture: "round",
    });

    const outsiderSpaceId = outsider.data.user.activeSpaceId!;
    const outsiderWine = await createWine(outsiderSpaceId, "Foreign Context Wine", outsiderToken);
    const outsiderSessionResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${outsiderSpaceId}/sessions`,
      {
        body: JSON.stringify({
          name: "Foreign context session",
          startsAt: "2026-08-13T17:00:00.000Z",
          status: "active",
        }),
        headers: headers(outsiderToken, randomOpaqueToken()),
        method: "POST",
      },
    );
    const outsiderSession = TastingSessionResponseSchema.parse(
      await outsiderSessionResponse.json(),
    ).data;
    const outsiderFlightResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${outsiderSpaceId}/sessions/${outsiderSession.id}/wines`,
      {
        body: JSON.stringify({ entries: [{ wineId: outsiderWine.id }] }),
        headers: headers(outsiderToken, randomOpaqueToken()),
        method: "POST",
      },
    );
    const outsiderFlight = TastingSessionDetailResponseSchema.parse(
      await outsiderFlightResponse.json(),
    ).data.wines[0]!;
    const foreignContext = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/tasting-notes/${ownerNote.id}`,
      {
        body: JSON.stringify({
          context: { previousSessionWineId: outsiderFlight.id },
          version: ownerNote.version,
        }),
        headers: headers(ownerToken),
        method: "PATCH",
      },
    );
    expect(foreignContext.status).toBe(404);

    const ownerRead = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/tasting-notes/${ownerNote.id}`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    expect(ownerRead.status).toBe(200);
    const readBack = DeepTastingResponseSchema.parse(await ownerRead.json()).data;
    expect(readBack.id).toBe(ownerNote.id);
    // The bead and the second nose phase round-trip through storage.
    expect(readBack.beadSize).toBe("fine");
    expect(readBack.effervescence).toBe(4);
    expect(readBack.noseSwirledIntensity).toBe(5);
    expect(readBack.noseSwirledText).toBe(`${90} swirled`);
    expect(readBack.context?.venueName).toBe("Casa de Prueba");
    expect(readBack.context?.venueCity).toBe("Barcelona");
    expect(readBack.context?.venueCountryCode).toBe("ES");
    const hiddenRead = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/tasting-notes/${ownerNote.id}`,
      { headers: { Authorization: `Bearer ${memberToken}` } },
    );
    expect(hiddenRead.status).toBe(404);

    const forbiddenEdit = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/tasting-notes/${ownerNote.id}`,
      {
        body: JSON.stringify({ conclusionText: "Tampered", version: ownerNote.version }),
        headers: headers(memberToken),
        method: "PATCH",
      },
    );
    expect(forbiddenEdit.status).toBe(404);

    const updatedResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/tasting-notes/${ownerNote.id}`,
      {
        body: JSON.stringify({
          conclusionText: "Preserved owner conclusion",
          context: { foodText: "Cheese", noiseLevel: 3 },
          descriptors: [
            { code: "earth.forest_floor", intensity: 3, phase: "nose" },
            { code: "fruit.red.cherry", intensity: 5, phase: "nose" },
          ],
          version: ownerNote.version,
        }),
        headers: headers(ownerToken),
        method: "PATCH",
      },
    );
    const updated = DeepTastingResponseSchema.parse(await updatedResponse.json()).data;
    expect(updated.conclusionText).toBe("Preserved owner conclusion");
    expect(updated.context).toMatchObject({ foodText: "Cheese", noiseLevel: 3 });
    expect(updated.descriptors).toEqual(
      expect.arrayContaining([
        { code: "earth.forest_floor", intensity: 3, phase: "nose" },
        { code: "fruit.red.cherry", intensity: 5, phase: "nose" },
      ]),
    );
    const staleResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/tasting-notes/${ownerNote.id}`,
      {
        body: JSON.stringify({ conclusionText: "Local conflict text", version: ownerNote.version }),
        headers: headers(ownerToken),
        method: "PATCH",
      },
    );
    const stale = ErrorEnvelopeSchema.parse(await staleResponse.json());
    expect(staleResponse.status).toBe(409);
    expect(stale.error.details?.current).toMatchObject({
      conclusionText: "Preserved owner conclusion",
    });

    for (const [token, note] of [
      [ownerToken, updated],
      [memberToken, memberNote],
    ] as const) {
      const response = await SELF.fetch(
        `https://vadevi.test/api/v1/spaces/${spaceId}/tasting-notes/${note.id}/submit`,
        {
          body: JSON.stringify({ version: note.version }),
          headers: headers(token),
          method: "POST",
        },
      );
      expect(response.status).toBe(200);
      expect(DeepTastingResponseSchema.parse(await response.json()).data.state).toBe("submitted");
    }

    const comparisonResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/sessions/${session.id}/comparison`,
      { headers: { Authorization: `Bearer ${memberToken}` } },
    );
    const comparison = SessionComparisonResponseSchema.parse(await comparisonResponse.json());
    expect(comparisonResponse.status).toBe(200);
    const compared = comparison.data.wines.find(
      (entry: ComparisonWine) => entry.sessionWineId === sessionWineId,
    )!;
    expect(compared).toMatchObject({
      buyAgainCount: 2,
      descriptorOverlap: ["fruit.red.cherry"],
      dispersion: 5,
      groupScore: 85,
      noteCount: 2,
      rank: 1,
    });
    expect(compared.participants).toHaveLength(2);
    expect(
      comparison.data.wines.find((entry: ComparisonWine) => entry.wineId === secondWine.id)
        ?.groupScore,
    ).toBeNull();

    const outsiderRead = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/sessions/${session.id}`,
      { headers: { Authorization: `Bearer ${outsiderToken}` } },
    );
    expect(outsiderRead.status).toBe(404);
    const summaries = await env.DB.prepare(
      `SELECT included_note_count, algorithm_version, computed_score_milli, source_version_hash
      FROM session_wine_summaries WHERE session_wine_id = ?`,
    )
      .bind(sessionWineId)
      .first<{
        algorithm_version: string;
        computed_score_milli: number;
        included_note_count: number;
        source_version_hash: string;
      }>();
    expect(summaries).toMatchObject({
      algorithm_version: "2026.1",
      computed_score_milli: 85_000,
      included_note_count: 2,
    });
    expect(summaries?.source_version_hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
  }, 30_000);
});

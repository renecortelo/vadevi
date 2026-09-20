import { BootstrapResponseSchema, CreateWineResponseSchema, type Fact } from "@vadevi/contracts";
import type { ResearchPorts, TranslationRequest } from "@vadevi/domain";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { translationBatches, translationLimits } from "../src/adapters/translation";
import { listWineFacts } from "../src/repositories/provenance";
import { createResearchJob } from "../src/repositories/research";
import { randomOpaqueToken } from "../src/security/opaque-token";
import type { FirebasePrincipal } from "../src/types";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * The evidence page changes language with the interface — all of it, not only
 * its labels. Research writes prose in the language asked for that day; a reader
 * in another language is served a translation, made once and kept, over a record
 * that is never rewritten.
 */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const ownerUid = "firebase-emulator-user-fact-translations-owner";
const ownerToken = emulatorIdToken({
  email: "fact-translations@example.test",
  name: "Translations Owner",
  sub: ownerUid,
});
const principal: FirebasePrincipal = {
  authTime: Math.floor(Date.now() / 1_000),
  emailVerified: true,
  displayName: "Translations Owner",
  email: "fact-translations@example.test",
  firebaseUid: ownerUid,
};

async function ownedSpaceWithWine() {
  const bootstrap = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  const spaceId = BootstrapResponseSchema.parse(await bootstrap.json()).data.user.activeSpaceId!;
  const created = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
    body: JSON.stringify({
      displayName: `Translated ${randomOpaqueToken().slice(0, 6)}`,
      identityStatus: "confirmed",
      nonVintage: false,
      producerName: "Bodegas Áster",
      vintageYear: 2020,
      wineType: "red",
    }),
    headers: {
      Authorization: `Bearer ${ownerToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": randomOpaqueToken(),
    },
    method: "POST",
  });
  expect(created.status).toBe(201);
  return { spaceId, wineId: CreateWineResponseSchema.parse(await created.json()).data.wine.id };
}

/** Research that finds one web curiosity and one pairing note, in English, and
 *  a translator that renders them in the reader's language. */
async function researchIn(locale: "de" | "es", spaceId: string, wineId: string) {
  const ports: ResearchPorts = {
    knowledge: null,
    product: null,
    providerMode: "open_data",
    translation: { translate: async ({ texts }) => texts.map((text) => `${locale}: ${text}`) },
    webSearch: {
      search: async ({ query }) => ({
        cached: false,
        data: [
          {
            snippet: query.includes("pair")
              ? "Pairs well with roast lamb."
              : "A red from Bodegas Áster.",
            source: {
              canonicalUrl: `https://example-winery.test/${query.includes("pair") ? "pairing" : "wine"}`,
              publisher: "example-winery.test",
              retrievedAt: "2026-09-18T10:00:00.000Z",
              sourceType: "other_web",
              title: query.includes("pair") ? "What to eat with it" : "The wine",
            },
            title: query.includes("pair") ? "What to eat with it" : "The wine",
          },
        ],
        status: "success",
      }),
    },
  };
  const job = await createResearchJob(env.DB, {
    idempotencyKey: randomOpaqueToken(),
    ports,
    principal,
    request: { locale, maxSources: 4, topics: ["identity"] },
    requestId: randomOpaqueToken(),
    spaceId,
    wineId,
  });
  expect(job.kind).toBe("success");
}

function prose(facts: Fact[]) {
  return Object.fromEntries(
    facts
      .filter((fact) => fact.predicate === "curiosity.note" || fact.predicate === "pairing.note")
      .map((fact) => [
        fact.predicate,
        { title: fact.citations[0]?.source.title, value: fact.value },
      ]),
  );
}

describe("fact translations", () => {
  it("serves evidence in the reader's language, translating once and keeping the record", async () => {
    const { spaceId, wineId } = await ownedSpaceWithWine();
    await researchIn("es", spaceId, wineId);

    // Both notes were translated at research time, title and body, and marked
    // as Spanish — a pairing note used to be stored as it came, in English.
    const asWritten = await listWineFacts(env.DB, { principal, spaceId, wineId });
    expect(prose(asWritten!.data.facts)).toEqual({
      "curiosity.note": { title: "es: The wine", value: "es: A red from Bodegas Áster." },
      "pairing.note": {
        title: "es: What to eat with it",
        value: "es: Pairs well with roast lamb.",
      },
    });

    // A reader in Spanish is served exactly that, and no model call is made.
    const calls: TranslationRequest[] = [];
    let reservations = 0;
    const localization = (locale: "de" | "es") => ({
      locale,
      reserveModelCall: async () => {
        reservations += 1;
        return true;
      },
      translation: {
        translate: async (request: TranslationRequest) => {
          calls.push(request);
          return request.texts.map((text) => `${request.locale}: ${text}`);
        },
      },
    });
    const inSpanish = await listWineFacts(env.DB, {
      localization: localization("es"),
      principal,
      spaceId,
      wineId,
    });
    expect(prose(inSpanish!.data.facts)).toEqual(prose(asWritten!.data.facts));
    expect(calls).toEqual([]);
    expect(reservations).toBe(0);

    // A reader in German is served a translation, made now — one call, paid for.
    const inGerman = await listWineFacts(env.DB, {
      localization: localization("de"),
      principal,
      spaceId,
      wineId,
    });
    expect(prose(inGerman!.data.facts)).toEqual({
      "curiosity.note": { title: "de: es: The wine", value: "de: es: A red from Bodegas Áster." },
      "pairing.note": {
        title: "de: es: What to eat with it",
        value: "de: es: Pairs well with roast lamb.",
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.locale).toBe("de");
    expect(reservations).toBe(1);

    // The next German reader gets the kept translation; nothing is asked again.
    const again = await listWineFacts(env.DB, {
      localization: localization("de"),
      principal,
      spaceId,
      wineId,
    });
    expect(prose(again!.data.facts)).toEqual(prose(inGerman!.data.facts));
    expect(calls).toHaveLength(1);
    expect(reservations).toBe(1);

    // And the record underneath is exactly what research wrote.
    const stillWritten = await listWineFacts(env.DB, { principal, spaceId, wineId });
    expect(prose(stillWritten!.data.facts)).toEqual(prose(asWritten!.data.facts));
  });

  it("answers in the written language when the budget refuses, without failing the read", async () => {
    const { spaceId, wineId } = await ownedSpaceWithWine();
    await researchIn("es", spaceId, wineId);

    let asked = 0;
    const inFrench = await listWineFacts(env.DB, {
      localization: {
        locale: "fr",
        reserveModelCall: async () => false,
        translation: {
          translate: async ({ texts }) => {
            asked += 1;
            return texts;
          },
        },
      },
      principal,
      spaceId,
      wineId,
    });
    expect(asked).toBe(0);
    expect(prose(inFrench!.data.facts)["pairing.note"]?.value).toBe(
      "es: Pairs well with roast lamb.",
    );
  });

  it("keeps one card per page when the wine is researched again in another language", async () => {
    const { spaceId, wineId } = await ownedSpaceWithWine();
    await researchIn("es", spaceId, wineId);
    // Researched again by a German-speaking member: the same two pages come
    // back, now rendered in German. A different value, the same note.
    await researchIn("de", spaceId, wineId);

    const facts = (await listWineFacts(env.DB, { principal, spaceId, wineId }))!.data.facts;
    const live = facts.filter((fact) => fact.status !== "retired");
    expect(live.filter((fact) => fact.predicate === "curiosity.note")).toHaveLength(1);
    expect(live.filter((fact) => fact.predicate === "pairing.note")).toHaveLength(1);
    // The first writing stands; a German reader is served its translation.
    expect(prose(live)["pairing.note"]?.value).toBe("es: Pairs well with roast lamb.");
  });

  it("batches texts within what one translation call will take", () => {
    // Sixteen short texts fit one call; the seventeenth starts another.
    const short = Array.from({ length: 17 }, (_, index) => `text ${index}`);
    expect(translationBatches(short).map((batch) => batch.length)).toEqual([16, 1]);
    // Long texts are cut by characters, well before sixteen.
    const long = Array.from({ length: 8 }, () => "x".repeat(translationLimits.charactersPerText));
    expect(translationBatches(long).map((batch) => batch.length)).toEqual([6, 2]);
    expect(translationBatches([])).toEqual([]);
  });
});

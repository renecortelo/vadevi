import type { AssistantLanguageStatement } from "@vadevi/domain";
import { BootstrapResponseSchema } from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import grapesFile from "../../../data/kb/grapes.json";
import termsFile from "../../../data/kb/terms.json";
import type { RegionEntry } from "../../../scripts/kb/appellation-names";
import type { GrapeEntry } from "../../../scripts/kb/grape-validation";
import { librarySql, type Vocabulary } from "../../../scripts/kb/library-sql";
import { runDeterministicAssistantTurn } from "../src/repositories/assistant";
import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "../tests/fixtures/firebase-token";
import regionsSample from "./regions-sample.json";

/**
 * Vicenç's question bank: every grape in the library asked about in one of
 * the eight languages (by its name in that language), by one of its
 * synonyms, a sample of registered names, and names that are no grape at
 * all. Each answer is read as the model would receive it — the statements —
 * and scored: did it find what was asked, does it carry every fact the card
 * has (a place's wine said as such), is each fact cited to the source it came
 * from, and does it stay silent on what the library does not hold.
 *
 * Usage: pnpm eval:vicenc (not part of `pnpm check`: it loads the whole
 * grape library and asks some 450 questions).
 */
const grapes = grapesFile as unknown as GrapeEntry[];
const regions = regionsSample as unknown as RegionEntry[];

const templates: [locale: string, nameKey: string, template: (name: string) => string][] = [
  ["en", "en", (name) => `What is ${name} like?`],
  ["es", "es", (name) => `¿Cómo es la uva ${name}?`],
  ["ca", "ca", (name) => `Com és el raïm ${name}?`],
  ["fr", "fr", (name) => `Comment est le cépage ${name} ?`],
  ["de", "de", (name) => `Wie ist die Rebsorte ${name}?`],
  ["it", "it", (name) => `Com'è il vitigno ${name}?`],
  ["nl", "nl", (name) => `Hoe is de druif ${name}?`],
  ["pt-PT", "pt", (name) => `Como é a casta ${name}?`],
];
const invented = ["Zarvenelle", "Quintobrisa", "Morvadeth", "Ellisgrau", "Tavrinola"];

const sub = "firebase-emulator-user-vicenc-eval";
const token = emulatorIdToken({ email: "vicenc-eval@example.test", name: "Reader", sub });
let spaceId = "";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const statement of librarySql(grapes, "eval", termsFile as unknown as Vocabulary, regions)) {
    await env.DB.prepare(statement).run();
  }
  const me = BootstrapResponseSchema.parse(
    await (
      await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json(),
  );
  spaceId = me.data.user.activeSpaceId;
}, 600_000);

async function ask(message: string, locale: string) {
  let statements: AssistantLanguageStatement[] = [];
  const response = await runDeterministicAssistantTurn(env.DB, {
    aiProvider: "cloudflare",
    externalResearch: false,
    language: {
      render: async (input) => {
        statements = input.statements;
        return { claims: [], modelVersion: "@cf/eval/none" };
      },
    },
    pairing: null,
    principal: {
      authTime: Math.floor(Date.now() / 1_000),
      displayName: "Reader",
      email: "vicenc-eval@example.test",
      emailVerified: true,
      firebaseUid: sub,
    },
    request: {
      context: { allowedCrossSpaceIds: [], visibleWineId: null },
      locale: locale as "en",
      message,
      saveHistory: false,
      threadId: null,
    },
    requestId: randomOpaqueToken(),
    semanticNotes: null,
    spaceId,
  });
  return { data: response?.data ?? null, statements };
}

/** Who a cited address should be credited to, by its host. */
function publisherFor(url: string): string {
  const host = new URL(url).hostname;
  if (host.endsWith("wikipedia.org")) return "Wikipedia";
  if (host.endsWith("wikivoyage.org")) return "Wikivoyage";
  if (host === "doi.org") {
    return new URL(url).pathname.startsWith("/10.25909/")
      ? "University of Adelaide"
      : "Open-access article";
  }
  if (host.endsWith("archive.org")) return "Internet Archive";
  if (host === "ec.europa.eu") return "EU register of geographical indications (eAmbrosia)";
  return host;
}

describe("Vicenç's question bank", () => {
  it("finds each grape, gives every fact its card has, cites each to its own source", async () => {
    const misses: string[] = [];
    let found = 0;
    let facts = 0;
    let factsGiven = 0;
    let cited = 0;
    let researched = 0;
    let credited = 0;
    let citations = 0;
    for (const [index, grape] of grapes.entries()) {
      const [locale, nameKey, template] = templates[index % templates.length]!;
      const name = grape.names[nameKey] ?? grape.names.en!;
      const { data, statements } = await ask(template(name), locale);
      if (data?.libraryGrapes.some((entry) => entry.id === grape.id)) found += 1;
      else {
        misses.push(`not found: ${grape.id} («${template(name)}»)`);
        continue;
      }
      const text = statements
        .filter((statement) => statement.id.startsWith(`library-${grape.id}-`))
        .map((statement) => statement.text)
        .join(" ");
      const expected = (["acidity", "tannin", "body", "alcohol"] as const)
        .filter((axis) => grape[axis] !== null)
        .map((axis) => `${axis} ${grape[axis]}`);
      if (grape.sweetness !== null) {
        expected.push(
          grape.sweetness.from === grape.sweetness.to
            ? grape.sweetness.from
            : `from ${grape.sweetness.from} to ${grape.sweetness.to}`,
        );
      }
      for (const place of new Set(
        grape.evidence.flatMap((entry) => (entry.place === undefined ? [] : [entry.place])),
      )) {
        expected.push(`said of the wine of ${place}`);
      }
      for (const fact of expected) {
        facts += 1;
        if (text.includes(fact)) factsGiven += 1;
        else misses.push(`fact missing: ${grape.id}: «${fact}»`);
      }
      for (const statement of statements.filter(
        (one) => one.id.startsWith(`library-${grape.id}-`) && one.evidenceClass === "researched",
      )) {
        researched += 1;
        if (statement.sourceIds.length > 0) cited += 1;
        else misses.push(`uncited: ${statement.id}`);
      }
      for (const source of data.citations) {
        citations += 1;
        if (source.publisher === publisherFor(source.canonicalUrl)) credited += 1;
        else misses.push(`miscredited: ${grape.id}: ${source.canonicalUrl} as ${source.publisher}`);
      }
    }
    const percent = (part: number, whole: number) =>
      whole === 0 ? "—" : `${((100 * part) / whole).toFixed(1)} %`;
    console.info(
      [
        `Grapes found: ${found} / ${grapes.length} (${percent(found, grapes.length)})`,
        `Card facts given: ${factsGiven} / ${facts} (${percent(factsGiven, facts)})`,
        `Researched statements cited: ${cited} / ${researched} (${percent(cited, researched)})`,
        `Citations credited to their own source: ${credited} / ${citations} (${percent(credited, citations)})`,
        ...misses.slice(0, 40).map((miss) => `  ${miss}`),
      ].join("\n"),
    );
    expect(factsGiven).toBe(facts);
    expect(cited).toBe(researched);
    expect(credited).toBe(citations);
    expect(found / grapes.length).toBeGreaterThan(0.95);
  }, 1_800_000);

  it("finds a grape by one of its other names", async () => {
    const withSynonym = grapes.filter((grape) => grape.synonyms.length > 0);
    const misses: string[] = [];
    let found = 0;
    for (const grape of withSynonym) {
      const synonym = grape.synonyms[0]!.name;
      const { data } = await ask(`${synonym}?`, "es");
      if (data?.libraryGrapes.some((entry) => entry.id === grape.id)) found += 1;
      else misses.push(`${grape.id} as «${synonym}»`);
    }
    console.info(
      [
        `Found by a synonym: ${found} / ${withSynonym.length}`,
        ...misses.slice(0, 30).map((miss) => `  not found: ${miss}`),
      ].join("\n"),
    );
    expect(found / withSynonym.length).toBeGreaterThan(0.8);
  }, 1_800_000);

  it("finds registered names, and says nothing of a grape that does not exist", async () => {
    let found = 0;
    const misses: string[] = [];
    for (const region of regions) {
      // As a Spanish reader writes it: its Spanish name, or one in Latin
      // letters («Letrinoi», not «Λετρίνοι»).
      const name =
        region.names.find((entry) => entry.locale === "es")?.name ??
        region.names.find((entry) => /^[\p{Script=Latin}\d\s'’.,()-]+$/u.test(entry.name))?.name ??
        region.name;
      const { data } = await ask(`¿Qué uvas se usan en ${name}?`, "es");
      if (data?.libraryRegions.some((entry) => entry.id === region.id)) found += 1;
      else misses.push(`${region.id} («${name}»)`);
    }
    let silent = 0;
    for (const name of invented) {
      const { data, statements } = await ask(`¿Cómo es la uva ${name}?`, "es");
      if (
        (data?.libraryGrapes.length ?? 0) === 0 &&
        !statements.some((statement) => statement.id.startsWith("library-"))
      ) {
        silent += 1;
      }
    }
    console.info(
      [
        `Registered names found: ${found} / ${regions.length}`,
        `Invented grapes met with silence: ${silent} / ${invented.length}`,
        ...misses.slice(0, 30).map((miss) => `  not found: ${miss}`),
      ].join("\n"),
    );
    expect(silent).toBe(invented.length);
    expect(found / regions.length).toBeGreaterThan(0.9);
  }, 1_800_000);
});

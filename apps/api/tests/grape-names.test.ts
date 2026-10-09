import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { readGrapes } from "../src/repositories/grape-names";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  const name = (grape: string, locale: string, value: string, kind: "primary" | "synonym") =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO kb_names (entity_type, entity_id, locale, name, normalized_name, kind, source)
        VALUES ('grape', ?, ?, ?, ?, ?, 'wikidata')`,
    ).bind(grape, locale, value, value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, ""), kind);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO kb_grapes (id, wikidata_id, prominence) VALUES
        ('names-tempranillo', 'Q-names-1', 10), ('names-malvasia-a', 'Q-names-2', 1),
        ('names-malvasia-b', 'Q-names-3', 1)`,
    ),
    name("names-tempranillo", "en", "Tempranillo", "primary"),
    name("names-tempranillo", "ca", "Ull de Llebre", "primary"),
    name("names-tempranillo", "*", "Tinto Fino", "synonym"),
    name("names-malvasia-a", "*", "Malvasia", "synonym"),
    name("names-malvasia-b", "*", "Malvasia", "synonym"),
  ]);
});

describe("one grape however it was written", () => {
  it("reads a library grape by any of its names, named in the reader's language", async () => {
    const readings = await readGrapes(env.DB, ["Tinto Fino", "tempranillo", "Tempranillo"], "ca");
    expect([...new Set(readings.values())]).toEqual(["Ull de Llebre"]);
    // No name of its own in the language asked: English.
    expect((await readGrapes(env.DB, ["Tinto Fino"], "nl")).get("Tinto Fino")).toBe("Tempranillo");
  });

  it("keeps a name two grapes share, and one the library lacks, as written", async () => {
    const readings = await readGrapes(env.DB, ["Malvasia", "Sumoll", "sumoll", "Sumoll"], "es");
    expect(readings.get("Malvasia")).toBe("Malvasia");
    // The spelling used most.
    expect(readings.get("sumoll")).toBe("Sumoll");
  });

  it("never reads a family's name as one grape", async () => {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO kb_names (entity_type, entity_id, locale, name, normalized_name, kind, source)
        VALUES ('grape', 'names-tempranillo', '*', 'Muscat', 'muscat', 'synonym', 'wikidata')`,
    ).run();
    expect((await readGrapes(env.DB, ["Muscat"], "es")).get("Muscat")).toBe("Muscat");
  });
});

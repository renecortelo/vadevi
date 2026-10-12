import { regionReadings } from "@vadevi/domain";

import { resolveAppellationCountries } from "./appellation-terms";
import { producerKey } from "./producer-names";
import { resolveCountryCodes, withoutCountryName } from "./country-terms";
import { normalizeWineText } from "./wine-memory";

/**
 * One region, however it was typed.
 *
 * Readers type a region as the label shows it, or as they remember it:
 * "Empordà", "Empordá", "Emporda", "DO Empordà", "DO emporda" are one
 * appellation written five ways, and counting or mapping them apart made five
 * regions of one. Each is read here as the same place: accents, case and the
 * designation's label ("DO", "D. O.", "Vino de la Tierra de"…) do not count,
 * and a name the EU register holds is shown as the register writes it. A name
 * it does not hold is shown in the spelling its readers used most.
 *
 * Nothing is written: the record keeps what was typed. This is how a region
 * is counted, filtered and placed on a map.
 *
 * A registered name is shown as the register writes it, in every language:
 * it is the legal name a label carries — Bourgogne, Rioja, Empordà — where the
 * library's names for it in other languages name the vineyard area around it
 * ("Viñedo de Borgoña", "Burgundy wine region").
 */

/** "DO Empordà", "Vino de la Tierra de Castilla": the name without its label. */
const designationPrefix =
  /^(denominacion de origen calificada|denominacion de origen|denominacio d origen qualificada|denominacio d origen|denominazione di origine controllata e garantita|denominazione di origine controllata|denominacao de origem controlada|denominacao de origem|indicazione geografica tipica|indicacao geografica|vino de la tierra de|vino de la tierra|vi de la terra de|vinho regional|tierra de|wine of origin|appellation d origine controlee|appellation d origine protegee|appellation|d o ca|d o q|d o c|d o|doca|doq|docg|doc|dop|do|aoc|aop|igp|igt|pdo|pgi|ava|wo)\s+/;

/**
 * "Rioja DOCa", "Chianti Classico DOCG", "Napa Valley AVA", "Appellation
 * Margaux Contrôlée": the label written after the name.
 */
const designationSuffix =
  /\s+(d o ca|d o c g|d o c|d o|doca|docg|doc|doq|do|dop|igp|igt|aoc|aop|pdo|pgi|ava|gi|wo|controlee|protegee)$/;

/** The member states, whose wine names one register holds. */
const euMembers = new Set([
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
]);

/** How many letters carry an accent: "Empordà" has one, "Emporda" none. */
/** 1 for a name written with a capital first, as a label writes it. */
function capitalised(name: string): number {
  return /^\p{Lu}/u.test(name) ? 1 : 0;
}

function accents(name: string): number {
  return [...name.normalize("NFD")].filter((letter) => /\p{M}/u.test(letter)).length;
}

/**
 * A region's normalized name, then the same without each label in turn —
 * before it ("DO Empordà") or after it ("Rioja DOCa") — then without the
 * country it names ("New Zealand Marlborough", "Marlborough, New Zealand"),
 * then as a register may write it ("Maipo Valley" for "Valle del Maipo").
 * Written "Margaret River, Western Australia", the place before the comma is
 * read the same way after all of these: what follows says where it is.
 */
export function nameForms(region: string): { bare: string; forms: string[] } {
  const forms: string[] = [];
  const add = (next: string) => {
    if (next.length > 0 && !forms.includes(next)) forms.push(next);
  };
  /** The name read off its labels, before and after it. */
  const unlabelled = (text: string) => {
    let form = normalizeWineText(text);
    add(form);
    for (const label of [designationPrefix, designationSuffix]) {
      for (let next = form.replace(label, ""); next !== form; next = form.replace(label, "")) {
        form = next;
        add(form);
      }
    }
    const local = withoutCountryName(form);
    add(local);
    for (const reading of regionReadings(local)) add(reading);
    return form;
  };
  const bare = unlabelled(region);
  const [head] = region.split(",");
  if (head !== undefined && head !== region) unlabelled(head);
  return { bare, forms };
}

export type PlaceReading = Readonly<{
  /** The country recorded, or else the one the region points to; null if none. */
  country: string | null;
  /** The region as one name, or null for a wine recorded without one. */
  region: string | null;
  /** The registered name it is, for certain: the library's id, or null. */
  regionRef: string | null;
}>;

/** Each wine's region as one name, and its country, recorded or as its region says. */
export async function readPlaces(
  database: D1Database,
  wines: readonly { countryCode: string | null; id: string; region: string | null }[],
): Promise<Map<string, PlaceReading>> {
  const regioned = wines.flatMap((wine) => {
    const region = wine.region?.trim() ?? "";
    if (region.length === 0) return [];
    const { bare, forms } = nameForms(region);
    // Labelled when a designation was read off it: "DO Empordà", "Rioja DOCa".
    return [{ ...wine, bare, forms, labelled: bare !== normalizeWineText(region), region }];
  });

  // The register's names, as the library holds them in every language, by
  // country: "Victoria" is a state in Australia and an indication in
  // Argentina, and a wine from either is one of them for certain.
  type Holder = { entries: number; id: string; label: string };
  const registered = new Map<string, Map<string, Holder>>();
  const asked = [...new Set(regioned.flatMap((wine) => wine.forms))];
  if (asked.length > 0) {
    const rows = await database
      .prepare(
        `SELECT name.normalized_name AS name, region.country_code AS code,
          COUNT(DISTINCT region.id) AS entries, MIN(region.name) AS label, MIN(region.id) AS id
        FROM kb_names name JOIN kb_regions region ON region.id = name.entity_id
        WHERE name.entity_type = 'region'
          AND name.normalized_name IN (SELECT value FROM json_each(?))
        GROUP BY name.normalized_name, region.country_code`,
      )
      .bind(JSON.stringify(asked))
      .all<{ code: string; entries: number; id: string; label: string; name: string }>();
    for (const row of rows.results) {
      const byCountry = registered.get(row.name) ?? new Map<string, Holder>();
      byCountry.set(row.code, { entries: row.entries, id: row.id, label: row.label });
      registered.set(row.name, byCountry);
    }
  }
  /**
   * The one entry a name is, for certain: within the wine's country where it
   * has one, or else across the atlas. A name two entries share names neither.
   */
  const entryOf = (form: string, country: string | null): Holder | null => {
    const byCountry = registered.get(form);
    if (byCountry === undefined) return null;
    const holders = [...byCountry.entries()];
    const single = holders.length === 1 && holders[0]![1].entries === 1 ? holders[0]! : null;
    if (country !== null) {
      const holder = byCountry.get(country);
      if (holder !== undefined) return holder.entries === 1 ? holder : null;
      // One EU register spans the member states, and files a name shared
      // across a border under one of them (Maasvallei Limburg, Belgian and
      // Dutch): a wine from the other is that name all the same.
      return single !== null && euMembers.has(country) && euMembers.has(single[0])
        ? single[1]
        : null;
    }
    return single?.[1] ?? null;
  };
  /** The one country a name is registered in, or null. */
  const countryOf = (form: string): string | null => {
    const byCountry = registered.get(form);
    return byCountry !== undefined && byCountry.size === 1 ? [...byCountry.keys()][0]! : null;
  };
  // A name the register does not hold: the spelling most of its wines use,
  // preferring one typed without a label.
  const spellings = new Map<string, Map<string, number>>();
  for (const wine of regioned) {
    const key = wine.bare;
    const counts = spellings.get(key) ?? new Map<string, number>();
    const weight = wine.labelled ? 1 : 1_000;
    counts.set(wine.region, (counts.get(wine.region) ?? 0) + weight);
    spellings.set(key, counts);
  }
  const spellingOf = (key: string) =>
    [...(spellings.get(key) ?? new Map<string, number>())].sort(
      // Then the fuller spelling: "Empordà" over "Emporda".
      ([leftName, left], [rightName, right]) =>
        right - left ||
        accents(rightName) - accents(leftName) ||
        capitalised(rightName) - capitalised(leftName) ||
        leftName.localeCompare(rightName),
    )[0]?.[0] ?? null;

  const readings = new Map<string, PlaceReading>();
  for (const wine of wines) {
    readings.set(wine.id, { country: wine.countryCode, region: null, regionRef: null });
  }
  for (const wine of regioned) {
    const known =
      wine.forms.map((form) => entryOf(form, wine.countryCode)).find((entry) => entry !== null) ??
      null;
    const region = known?.label ?? spellingOf(wine.bare);
    let country = wine.countryCode;
    if (country === null) {
      const named = new Set([
        ...resolveCountryCodes(wine.region),
        ...resolveAppellationCountries(wine.region),
      ]);
      country =
        named.size === 1
          ? [...named][0]!
          : named.size === 0
            ? (wine.forms.map((form) => countryOf(form)).find(Boolean) ?? null)
            : null;
    }
    readings.set(wine.id, { country, region, regionRef: known?.id ?? null });
  }
  return readings;
}

/**
 * The registered name a typed region is, for certain: the library's id, or
 * null. Within the wine's country where it is known.
 */
export async function regionRefOf(
  database: D1Database,
  region: string,
  countryCode: string | null = null,
): Promise<string | null> {
  const reading = await readPlaces(database, [{ countryCode, id: "region", region }]);
  return reading.get("region")?.regionRef ?? null;
}

/** The one country a region names, or null when it names none or several. */
export async function countryOfRegion(
  database: D1Database,
  region: string,
): Promise<string | null> {
  const reading = await readPlaces(database, [{ countryCode: null, id: "region", region }]);
  return reading.get("region")?.country ?? null;
}

/**
 * The one country a producer's other wines are recorded in, among the wines
 * the reader can see in every Space they belong to — a producer is, nearly
 * always, in one country. The producer is read as one house however written
 * ("Bodegas Sumarroca" is "Sumarroca"). Null when none is recorded, or
 * several are.
 */
export async function countryOfProducer(
  database: D1Database,
  firebaseUid: string,
  producerName: string,
): Promise<string | null> {
  const rows = await database
    .prepare(
      `SELECT DISTINCT wine.producer_name, wine.country_code
      FROM wine_records wine
      JOIN space_memberships membership ON membership.space_id = wine.space_id
        AND membership.status = 'active'
      JOIN users reader ON reader.id = membership.user_id
      WHERE reader.firebase_uid = ? AND reader.deleted_at IS NULL
        AND wine.deleted_at IS NULL AND wine.country_code IS NOT NULL`,
    )
    .bind(firebaseUid)
    .all<{ country_code: string; producer_name: string }>();
  const wanted = producerKey(producerName);
  const countries = new Set(
    rows.results
      .filter((row) => producerKey(row.producer_name) === wanted)
      .map((row) => row.country_code),
  );
  return countries.size === 1 ? [...countries][0]! : null;
}

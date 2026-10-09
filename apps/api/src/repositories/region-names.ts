import { resolveAppellationCountries } from "./appellation-terms";
import { resolveCountryCodes } from "./country-terms";
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
 */

/** "DO Empordà", "Vino de la Tierra de Castilla": the name without its label. */
const designationPrefix =
  /^(denominacion de origen calificada|denominacion de origen|denominacio d origen qualificada|denominacio d origen|vino de la tierra de|vino de la tierra|vi de la terra de|tierra de|d o ca|d o q|d o c|d o|doca|doq|docg|doc|dop|do|aoc|aop|igp|igt|pdo|pgi)\s+/;

/** How many letters carry an accent: "Empordà" has one, "Emporda" none. */
function accents(name: string): number {
  return [...name.normalize("NFD")].filter((letter) => /\p{M}/u.test(letter)).length;
}

/** A region's normalized name, then the same without each label in turn. */
function nameForms(region: string): string[] {
  const forms = [normalizeWineText(region)];
  for (let bare = forms[0]!.replace(designationPrefix, ""); bare !== forms.at(-1);) {
    forms.push(bare);
    bare = bare.replace(designationPrefix, "");
  }
  return forms.filter((form) => form.length > 0);
}

export type PlaceReading = Readonly<{
  /** The country recorded, or else the one the region points to; null if none. */
  country: string | null;
  /** The region as one name, or null for a wine recorded without one. */
  region: string | null;
}>;

/** Each wine's region as one name, and its country, recorded or as its region says. */
export async function readPlaces(
  database: D1Database,
  wines: readonly { countryCode: string | null; id: string; region: string | null }[],
): Promise<Map<string, PlaceReading>> {
  const regioned = wines.flatMap((wine) => {
    const region = wine.region?.trim() ?? "";
    return region.length === 0 ? [] : [{ ...wine, forms: nameForms(region), region }];
  });

  // The register's names, as the library holds them in every language.
  const registered = new Map<string, { code: string | null; label: string | null }>();
  const asked = [...new Set(regioned.flatMap((wine) => wine.forms))];
  if (asked.length > 0) {
    const rows = await database
      .prepare(
        `SELECT name.normalized_name AS name,
          COUNT(DISTINCT region.id) AS entries, MIN(region.name) AS label,
          COUNT(DISTINCT region.country_code) AS countries, MIN(region.country_code) AS code
        FROM kb_names name JOIN kb_regions region ON region.id = name.entity_id
        WHERE name.entity_type = 'region'
          AND name.normalized_name IN (SELECT value FROM json_each(?))
        GROUP BY name.normalized_name`,
      )
      .bind(JSON.stringify(asked))
      .all<{ code: string; countries: number; entries: number; label: string; name: string }>();
    for (const row of rows.results) {
      // A name two entries share names neither of them for certain.
      registered.set(row.name, {
        code: row.countries === 1 ? row.code : null,
        label: row.entries === 1 ? row.label : null,
      });
    }
  }

  // A name the register does not hold: the spelling most of its wines use,
  // preferring one typed without a label.
  const spellings = new Map<string, Map<string, number>>();
  for (const wine of regioned) {
    const key = wine.forms.at(-1)!;
    const counts = spellings.get(key) ?? new Map<string, number>();
    const weight = wine.forms.length === 1 ? 1_000 : 1;
    counts.set(wine.region, (counts.get(wine.region) ?? 0) + weight);
    spellings.set(key, counts);
  }
  const spellingOf = (key: string) =>
    [...(spellings.get(key) ?? new Map<string, number>())].sort(
      // Then the fuller spelling: "Empordà" over "Emporda".
      ([leftName, left], [rightName, right]) =>
        right - left || accents(rightName) - accents(leftName) || leftName.localeCompare(rightName),
    )[0]?.[0] ?? null;

  const readings = new Map<string, PlaceReading>();
  for (const wine of wines) readings.set(wine.id, { country: wine.countryCode, region: null });
  for (const wine of regioned) {
    const known = wine.forms.map((form) => registered.get(form)).find((entry) => entry?.label);
    const region = known?.label ?? spellingOf(wine.forms.at(-1)!);
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
            ? (wine.forms.map((form) => registered.get(form)?.code).find(Boolean) ?? null)
            : null;
    }
    readings.set(wine.id, { country, region });
  }
  return readings;
}

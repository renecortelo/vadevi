import { readPlaces } from "./region-names";

/**
 * Wines recorded before the library knew their region's name.
 *
 * A wine is linked to its registered name when it is recorded or edited; one
 * recorded before a country joined the atlas, or before the library learnt to
 * read its label ("Rioja DOCa", "Maipo Valley"), stayed unlinked. Each
 * scheduled run reads a batch of unlinked wines against the library as it is
 * now and links those that name one registered name for certain, in their own
 * country. Each wine is read once per build of the library
 * (`region_ref_checked`), so a wine that names nothing registered is not read
 * again until the library changes.
 *
 * A link already made is never changed, and the wine's own version and
 * timestamp are not touched: the link is derived from what the reader typed,
 * which stays as it was.
 */
const batch = 200;

export async function linkWineRegions(
  database: D1Database,
): Promise<{ checked: number; linked: number }> {
  const version = (
    await database
      .prepare("SELECT value FROM kb_meta WHERE key = 'version'")
      .first<{ value: string }>()
  )?.value;
  if (version === undefined) return { checked: 0, linked: 0 };
  const wines = (
    await database
      .prepare(
        `SELECT id, region, country_code FROM wine_records
        WHERE region_ref IS NULL AND region IS NOT NULL AND trim(region) <> ''
          AND deleted_at IS NULL
          AND (region_ref_checked IS NULL OR region_ref_checked <> ?)
        LIMIT ?`,
      )
      .bind(version, batch)
      .all<{ country_code: string | null; id: string; region: string }>()
  ).results;
  if (wines.length === 0) return { checked: 0, linked: 0 };
  const readings = await readPlaces(
    database,
    wines.map((wine) => ({ countryCode: wine.country_code, id: wine.id, region: wine.region })),
  );
  let linked = 0;
  await database.batch(
    wines.map((wine) => {
      const regionRef = readings.get(wine.id)?.regionRef ?? null;
      if (regionRef !== null) linked += 1;
      // Only if nobody linked it or changed its region since it was read.
      return database
        .prepare(
          `UPDATE wine_records SET region_ref = ?, region_ref_checked = ?
          WHERE id = ? AND region_ref IS NULL AND region = ?`,
        )
        .bind(regionRef, version, wine.id, wine.region);
    }),
  );
  return { checked: wines.length, linked };
}

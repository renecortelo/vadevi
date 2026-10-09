import type {
  GrapeProposal,
  ProducerProposal,
  RegionProposal,
  RenameRegionsRequest,
} from "@vadevi/contracts";
import { ulid } from "ulid";

import type { FirebasePrincipal } from "../types";
import { libraryGrapeIds, readGrapes } from "./grape-names";
import { producerKey } from "./producer-names";
import { countryOfRegion, readPlaces, regionRefOf } from "./region-names";
import { activeWineMemberId, normalizeWineText } from "./wine-memory";

/** Letters to change to turn one name into the other. */
function distance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0]!;
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column]!;
      previous[column] = Math.min(
        above + 1,
        previous[column - 1]! + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length]!;
}

/**
 * What could be tidied among a Space's regions: one place written several
 * ways, under the name the register gives it or the spelling used most; and a
 * name no register holds that is a letter or two from one it does, in the
 * same country ("La Mancga" → "La Mancha"). Null for a reader who is not a
 * member.
 */
export async function proposeRegionTidying(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
): Promise<RegionProposal[] | null> {
  if ((await activeWineMemberId(database, principal, spaceId)) === null) return null;
  const wines = await database
    .prepare(
      `SELECT id, region, country_code FROM wine_records
      WHERE space_id = ? AND deleted_at IS NULL AND merged_into_wine_id IS NULL
        AND region IS NOT NULL AND trim(region) <> ''`,
    )
    .bind(spaceId)
    .all<{ country_code: string | null; id: string; region: string }>();
  const readings = await readPlaces(
    database,
    wines.results.map((wine) => ({
      countryCode: wine.country_code,
      id: wine.id,
      region: wine.region,
    })),
  );

  // Wines by the name they read as, and how each is written.
  const groups = new Map<
    string,
    { country: string | null; linked: boolean; spellings: Map<string, number> }
  >();
  for (const wine of wines.results) {
    const reading = readings.get(wine.id);
    const name = reading?.region ?? wine.region;
    const group = groups.get(name) ?? {
      country: null,
      linked: false,
      spellings: new Map<string, number>(),
    };
    group.country ??= reading?.country ?? null;
    // A registered name is linked: it already reads as one, in every language.
    group.linked ||= reading?.regionRef != null;
    group.spellings.set(wine.region, (group.spellings.get(wine.region) ?? 0) + 1);
    groups.set(name, group);
  }

  const registered = await database
    .prepare(`SELECT name, country_code FROM kb_regions`)
    .all<{ country_code: string; name: string }>();
  const registeredNames = new Set(registered.results.map((row) => row.name));

  const proposals: RegionProposal[] = [];
  for (const [name, group] of groups) {
    if (group.linked) continue;
    const others = [...group.spellings].filter(([spelling]) => spelling !== name);
    if (others.length > 0) {
      proposals.push({
        countryCode: group.country,
        from: others.map(([region, count]) => ({ region, wines: count })),
        reason: "variants",
        to: name,
        unchanged: group.spellings.get(name) ?? 0,
      });
      continue;
    }
    // Written one way, held by no register: perhaps one misspelt.
    if (registeredNames.has(name)) continue;
    const plain = normalizeWineText(name);
    if (plain.length < 5) continue;
    const near = registered.results
      .filter((row) => group.country === null || row.country_code === group.country)
      .map((row) => ({ ...row, apart: distance(plain, normalizeWineText(row.name)) }))
      .filter((row) => row.apart > 0 && row.apart <= (plain.length >= 8 ? 2 : 1))
      .sort((left, right) => left.apart - right.apart);
    // Only a single nearest name: two equally near would be a guess.
    if (near[0] === undefined || near[1]?.apart === near[0].apart) continue;
    proposals.push({
      countryCode: near[0].country_code,
      from: [...group.spellings].map(([region, count]) => ({ region, wines: count })),
      reason: "typo",
      to: near[0].name,
      unchanged: 0,
    });
  }
  const wineCount = (proposal: RegionProposal) =>
    proposal.from.reduce((sum, entry) => sum + entry.wines, 0);
  return proposals.sort((left, right) => wineCount(right) - wineCount(left)).slice(0, 50);
}

/**
 * Rename every wine in the Space written one of these ways, as confirmed.
 * A wine with no country takes the one the new name points to.
 */
export async function renameRegions(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  request: RenameRegionsRequest,
  requestId: string,
): Promise<number | null> {
  const actorId = await activeWineMemberId(database, principal, spaceId);
  if (actorId === null) return null;
  const now = new Date().toISOString();
  const country = await countryOfRegion(database, request.to);
  // Renamed to a registered name, the wine is linked to it.
  const regionRef = await regionRefOf(database, request.to);
  const from = JSON.stringify(request.from);
  const results = await database.batch([
    database
      .prepare(
        `UPDATE wine_records SET region = ?, normalized_region = ?, region_ref = ?,
          country_code = coalesce(country_code, ?),
          normalized_country_code = coalesce(normalized_country_code, ?),
          version = version + 1, updated_at = ?
        WHERE space_id = ? AND deleted_at IS NULL AND merged_into_wine_id IS NULL
          AND region IN (SELECT value FROM json_each(?)) AND region <> ?`,
      )
      .bind(
        request.to,
        normalizeWineText(request.to),
        regionRef,
        country,
        country,
        now,
        spaceId,
        from,
        request.to,
      ),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        )
        SELECT space_id, 'wine_record', id, 'update', version, ?
        FROM wine_records WHERE space_id = ? AND updated_at = ? AND region = ?`,
      )
      .bind(now, spaceId, now, request.to),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) VALUES (?, ?, ?, 'wine.regions_renamed', 'space', ?, ?, ?, ?)`,
      )
      .bind(
        ulid(),
        actorId,
        spaceId,
        spaceId,
        requestId,
        JSON.stringify({ spellings: request.from.length }),
        now,
      ),
  ]);
  return results[0]?.meta.changes ?? 0;
}

/**
 * A Space's producers written several ways — "Bodegas Sumarroca" and
 * "Sumarroca" — under the spelling most of their wines use (the fuller one on
 * a tie). Null for a reader who is not a member.
 */
export async function proposeProducerTidying(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
): Promise<ProducerProposal[] | null> {
  if ((await activeWineMemberId(database, principal, spaceId)) === null) return null;
  const rows = await database
    .prepare(
      `SELECT producer_name, COUNT(*) AS wines FROM wine_records
      WHERE space_id = ? AND deleted_at IS NULL AND merged_into_wine_id IS NULL
      GROUP BY producer_name`,
    )
    .bind(spaceId)
    .all<{ producer_name: string; wines: number }>();
  const houses = new Map<string, { producer: string; wines: number }[]>();
  for (const row of rows.results) {
    const key = producerKey(row.producer_name);
    houses.set(key, [
      ...(houses.get(key) ?? []),
      { producer: row.producer_name, wines: row.wines },
    ]);
  }
  const accents = (name: string) =>
    [...name.normalize("NFD")].filter((letter) => /\p{M}/u.test(letter)).length;
  const proposals: ProducerProposal[] = [];
  for (const spellings of houses.values()) {
    if (spellings.length < 2) continue;
    const [chosen] = [...spellings].sort(
      (left, right) =>
        right.wines - left.wines ||
        right.producer.length - left.producer.length ||
        accents(right.producer) - accents(left.producer) ||
        left.producer.localeCompare(right.producer),
    );
    proposals.push({
      from: spellings.filter((entry) => entry.producer !== chosen!.producer),
      to: chosen!.producer,
      unchanged: chosen!.wines,
    });
  }
  return proposals
    .sort(
      (left, right) =>
        right.from.reduce((sum, entry) => sum + entry.wines, 0) -
        left.from.reduce((sum, entry) => sum + entry.wines, 0),
    )
    .slice(0, 50);
}

/** Rename every wine in the Space by one of these producer spellings, as confirmed. */
export async function renameProducers(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  request: RenameRegionsRequest,
  requestId: string,
): Promise<number | null> {
  const actorId = await activeWineMemberId(database, principal, spaceId);
  if (actorId === null) return null;
  const now = new Date().toISOString();
  const results = await database.batch([
    database
      .prepare(
        `UPDATE wine_records SET producer_name = ?, normalized_producer_name = ?,
          version = version + 1, updated_at = ?
        WHERE space_id = ? AND deleted_at IS NULL AND merged_into_wine_id IS NULL
          AND producer_name IN (SELECT value FROM json_each(?)) AND producer_name <> ?`,
      )
      .bind(
        request.to,
        normalizeWineText(request.to),
        now,
        spaceId,
        JSON.stringify(request.from),
        request.to,
      ),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        )
        SELECT space_id, 'wine_record', id, 'update', version, ?
        FROM wine_records WHERE space_id = ? AND updated_at = ? AND producer_name = ?`,
      )
      .bind(now, spaceId, now, request.to),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) VALUES (?, ?, ?, 'wine.producers_renamed', 'space', ?, ?, ?, ?)`,
      )
      .bind(
        ulid(),
        actorId,
        spaceId,
        spaceId,
        requestId,
        JSON.stringify({ spellings: request.from.length }),
        now,
      ),
  ]);
  return results[0]?.meta.changes ?? 0;
}

/**
 * A Space's grapes written several ways — "Carignan", "Samsó", "Samso" and
 * "Cariñena" — offered under the name the wine library gives the grape in the
 * reader's language, or the spelling used most where the library does not
 * know it. Null for a reader who is not a member.
 */
export async function proposeGrapeTidying(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  locale: string,
): Promise<GrapeProposal[] | null> {
  if ((await activeWineMemberId(database, principal, spaceId)) === null) return null;
  const rows = await database
    .prepare(
      `SELECT trim(grape.name_snapshot) AS name, COUNT(DISTINCT grape.wine_id) AS wines
      FROM wine_grapes grape
      JOIN wine_records wine ON wine.id = grape.wine_id AND wine.deleted_at IS NULL
        AND wine.merged_into_wine_id IS NULL
      WHERE grape.space_id = ? AND trim(grape.name_snapshot) <> ''
      GROUP BY trim(grape.name_snapshot)`,
    )
    .bind(spaceId)
    .all<{ name: string; wines: number }>();
  // A grape the library knows already reads as one, in the reader's
  // language; only names it does not know are offered here.
  const ids = await libraryGrapeIds(
    database,
    rows.results.map((row) => row.name),
  );
  const unknown = rows.results.filter((row) => ids.get(row.name) == null);
  const readings = await readGrapes(
    database,
    unknown.map((row) => row.name),
    locale,
  );
  const grapes = new Map<string, { grape: string; wines: number }[]>();
  for (const row of unknown) {
    const label = readings.get(row.name) ?? row.name;
    grapes.set(label, [...(grapes.get(label) ?? []), { grape: row.name, wines: row.wines }]);
  }
  const proposals: GrapeProposal[] = [];
  for (const [label, spellings] of grapes) {
    const others = spellings.filter((entry) => entry.grape !== label);
    if (others.length === 0) continue;
    proposals.push({
      from: others,
      to: label,
      unchanged: spellings.find((entry) => entry.grape === label)?.wines ?? 0,
    });
  }
  return proposals
    .sort(
      (left, right) =>
        right.from.reduce((sum, entry) => sum + entry.wines, 0) -
        left.from.reduce((sum, entry) => sum + entry.wines, 0),
    )
    .slice(0, 50);
}

/** Rename a grape on every wine in the Space that lists it one of these ways. */
export async function renameGrapes(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  request: RenameRegionsRequest,
  requestId: string,
): Promise<number | null> {
  const actorId = await activeWineMemberId(database, principal, spaceId);
  if (actorId === null) return null;
  const now = new Date().toISOString();
  const from = JSON.stringify(request.from);
  // Renamed to a name the library knows, the grape is linked to it.
  const grapeId = (await libraryGrapeIds(database, [request.to])).get(request.to.trim()) ?? null;
  const results = await database.batch([
    // The wines first, each a new version for the devices that sync it.
    database
      .prepare(
        `UPDATE wine_records SET version = version + 1, updated_at = ?
        WHERE space_id = ? AND deleted_at IS NULL AND id IN (
          SELECT wine_id FROM wine_grapes WHERE space_id = ?
            AND trim(name_snapshot) IN (SELECT value FROM json_each(?))
            AND trim(name_snapshot) <> ?)`,
      )
      .bind(now, spaceId, spaceId, from, request.to),
    database
      .prepare(
        `UPDATE wine_grapes SET name_snapshot = ?, normalized_name = ?, grape_code = ?,
          updated_at = ?
        WHERE space_id = ? AND trim(name_snapshot) IN (SELECT value FROM json_each(?))
          AND trim(name_snapshot) <> ?`,
      )
      .bind(request.to, normalizeWineText(request.to), grapeId, now, spaceId, from, request.to),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        )
        SELECT space_id, 'wine_record', id, 'update', version, ?
        FROM wine_records WHERE space_id = ? AND updated_at = ?`,
      )
      .bind(now, spaceId, now),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) VALUES (?, ?, ?, 'wine.grapes_renamed', 'space', ?, ?, ?, ?)`,
      )
      .bind(
        ulid(),
        actorId,
        spaceId,
        spaceId,
        requestId,
        JSON.stringify({ spellings: request.from.length }),
        now,
      ),
  ]);
  return results[1]?.meta.changes ?? 0;
}

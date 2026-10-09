import type { CurrencyCode, ScoreBand, WineStats, WineStatsQuery } from "@vadevi/contracts";
import { supportedCurrencies } from "@vadevi/contracts";

import type { FirebasePrincipal } from "../types";
import { resolveAppellationCountries } from "./appellation-terms";
import { resolveCountryCodes } from "./country-terms";
import { normalizeWineText } from "./wine-memory";

/**
 * A reader's numbers, counted from their records.
 *
 * Two scopes, the same counts: "personal" is the reader's own notes, purchases
 * and bottles in every Space they are an active member of; "space" is
 * everyone's in one Space, a note counting only while its author is still a
 * member. Nothing is estimated and no model is involved: every figure is a
 * COUNT, SUM or AVG over rows, and money stays in the currency it was paid in.
 */

type Bind = string | number | null;
type Filter = { binds: Bind[]; sql: string };

type Scope = Readonly<{
  /**
   * The country of each wine recorded without one whose region says it, as a
   * JSON object of wine id → ISO code (see `inferCountries`).
   */
  inferredCountries: string;
  /** The rows counted are the reader's own (personal), or everyone's (space). */
  ownerId: string | null;
  spaceIds: readonly string[];
}>;

/** A wine's country: as recorded, or as its region says. */
function countryOf(alias: string, scope: Scope): Filter {
  return {
    binds: [scope.inferredCountries],
    sql: `coalesce(${alias}.country_code, json_extract(?, '$."' || ${alias}.id || '"'))`,
  };
}

/** "DO Empordà", "Vino de la Tierra de Castilla": the name without its label. */
const designationPrefix =
  /^(denominacion de origen calificada|denominacion de origen|denominacio d origen qualificada|denominacio d origen|vino de la tierra de|vino de la tierra|vi de la terra de|tierra de|d o ca|d o q|d o c|d o|doca|doq|docg|doc|dop|do|aoc|aop|igp|igt|pdo|pgi)\s+/;

/**
 * The country of every wine in these Spaces recorded without one, where its
 * region says which: a country named in it ("Rivergaro Italia"), one of the
 * appellations Vicenç already places ("Penedès", "Parras"), or a name in the
 * EU register the library holds ("Conca de Barberà"). Only a region that
 * points to one country counts; "La Mancga" points nowhere and stays unknown.
 * Nothing is written: the record keeps what was recorded.
 */
async function inferCountries(database: D1Database, spaceIds: readonly string[]): Promise<string> {
  const wines = await database
    .prepare(
      `SELECT id, region FROM wine_records
      WHERE space_id IN (SELECT value FROM json_each(?)) AND deleted_at IS NULL
        AND country_code IS NULL AND region IS NOT NULL AND trim(region) <> ''`,
    )
    .bind(JSON.stringify(spaceIds))
    .all<{ id: string; region: string }>();
  const inferred: Record<string, string> = {};
  const unresolved: { id: string; names: string[] }[] = [];
  for (const wine of wines.results) {
    const codes = new Set([
      ...resolveCountryCodes(wine.region),
      ...resolveAppellationCountries(wine.region),
    ]);
    if (codes.size === 1) {
      inferred[wine.id] = [...codes][0]!;
    } else if (codes.size === 0) {
      // Each label off in turn: "D. O. Tierra de Castilla" is Castilla.
      const names = [normalizeWineText(wine.region)];
      for (let bare = names[0]!.replace(designationPrefix, ""); bare !== names.at(-1);) {
        names.push(bare);
        bare = bare.replace(designationPrefix, "");
      }
      unresolved.push({ id: wine.id, names });
    }
  }
  if (unresolved.length > 0) {
    const registered = await database
      .prepare(
        `SELECT name.normalized_name AS name, COUNT(DISTINCT region.country_code) AS countries,
          MIN(region.country_code) AS code
        FROM kb_names name JOIN kb_regions region ON region.id = name.entity_id
        WHERE name.entity_type = 'region'
          AND name.normalized_name IN (SELECT value FROM json_each(?))
        GROUP BY name.normalized_name`,
      )
      .bind(JSON.stringify([...new Set(unresolved.flatMap((wine) => wine.names))]))
      .all<{ code: string; countries: number; name: string }>();
    const countryByName = new Map(
      registered.results.filter((row) => row.countries === 1).map((row) => [row.name, row.code]),
    );
    for (const wine of unresolved) {
      const code = wine.names.map((name) => countryByName.get(name)).find(Boolean);
      if (code !== undefined) inferred[wine.id] = code;
    }
  }
  return JSON.stringify(inferred);
}

function spaceFilter(alias: string, scope: Scope): Filter {
  return {
    binds: [JSON.stringify(scope.spaceIds)],
    sql: `${alias}.space_id IN (SELECT value FROM json_each(?))`,
  };
}

function join(...filters: Filter[]): Filter {
  return {
    binds: filters.flatMap((filter) => filter.binds),
    sql: filters.map((filter) => filter.sql).join(" AND "),
  };
}

function period(column: string, query: WineStatsQuery): Filter {
  return {
    binds: [query.from ?? "0000-01-01", query.to ?? "9999-12-31"],
    sql: `substr(${column}, 1, 10) BETWEEN ? AND ?`,
  };
}

/**
 * The narrowing to one type, country, region or grape, as a condition on a
 * wine id: every count — notes, purchases, bottles, wines — follows the wine.
 */
function wineMatch(column: string, query: WineStatsQuery, scope: Scope): Filter {
  const conditions: Filter[] = [];
  if (query.type !== undefined) {
    conditions.push({
      binds: [query.type],
      sql: "coalesce(narrowed.wine_type_free, narrowed.wine_type) = ?",
    });
  }
  if (query.country !== undefined) {
    const country = countryOf("narrowed", scope);
    conditions.push({ binds: [...country.binds, query.country], sql: `${country.sql} = ?` });
  }
  if (query.region !== undefined) {
    conditions.push({
      binds: [query.region],
      sql: "lower(trim(narrowed.region)) = lower(trim(?))",
    });
  }
  if (query.grape !== undefined) {
    conditions.push({
      binds: [query.grape],
      sql: `EXISTS (SELECT 1 FROM wine_grapes narrowed_grape
        WHERE narrowed_grape.wine_id = narrowed.id
          AND lower(trim(narrowed_grape.name_snapshot)) = lower(trim(?)))`,
    });
  }
  if (conditions.length === 0) return { binds: [], sql: "1 = 1" };
  const all = join(...conditions);
  return {
    binds: all.binds,
    sql: `${column} IN (SELECT narrowed.id FROM wine_records narrowed WHERE ${all.sql})`,
  };
}

/** The same scope and period, without narrowing to a wine's attributes. */
function unnarrowed(query: WineStatsQuery): WineStatsQuery {
  return {
    ...(query.from === undefined ? {} : { from: query.from }),
    ...(query.to === undefined ? {} : { to: query.to }),
  };
}

/** Submitted notes in scope; in a Space, only those of current members. */
function notesIn(scope: Scope, query: WineStatsQuery): Filter {
  return join(
    spaceFilter("note", scope),
    { binds: [], sql: "note.state = 'submitted' AND note.deleted_at IS NULL" },
    scope.ownerId === null
      ? {
          binds: [],
          sql: `EXISTS (SELECT 1 FROM space_memberships member
            WHERE member.space_id = note.space_id AND member.user_id = note.author_user_id
              AND member.status = 'active')`,
        }
      : { binds: [scope.ownerId], sql: "note.author_user_id = ?" },
    period("note.tasted_at", query),
    wineMatch("note.wine_id", query, scope),
  );
}

function purchasesIn(scope: Scope, query: WineStatsQuery): Filter {
  return join(
    spaceFilter("purchase", scope),
    { binds: [], sql: "purchase.deleted_at IS NULL" },
    scope.ownerId === null
      ? { binds: [], sql: "1 = 1" }
      : { binds: [scope.ownerId], sql: "purchase.purchaser_user_id = ?" },
    period("purchase.purchased_at", query),
    wineMatch("purchase.wine_id", query, scope),
  );
}

function bottlesIn(scope: Scope, query: WineStatsQuery): Filter {
  return join(
    spaceFilter("bottle", scope),
    { binds: [], sql: "bottle.deleted_at IS NULL AND bottle.state <> 'removed'" },
    scope.ownerId === null
      ? { binds: [], sql: "1 = 1" }
      : { binds: [scope.ownerId], sql: "bottle.created_by_user_id = ?" },
    period("bottle.acquired_at", query),
    wineMatch("bottle.wine_id", query, scope),
  );
}

/**
 * The wines in scope, each once: those recorded (by the reader, or by anyone
 * in the Space) and those tasted, bought or kept. A wine merged into another
 * is counted as that one.
 */
function winesIn(scope: Scope, query: WineStatsQuery): Filter {
  const notes = notesIn(scope, query);
  const purchases = purchasesIn(scope, query);
  const bottles = bottlesIn(scope, query);
  const recorded = join(
    spaceFilter("recorded", scope),
    scope.ownerId === null
      ? { binds: [], sql: "1 = 1" }
      : { binds: [scope.ownerId], sql: "recorded.created_by_user_id = ?" },
    period("recorded.created_at", query),
    wineMatch("recorded.id", query, scope),
  );
  return {
    binds: [...recorded.binds, ...notes.binds, ...purchases.binds, ...bottles.binds],
    sql: `wine.deleted_at IS NULL AND wine.merged_into_wine_id IS NULL AND wine.id IN (
      SELECT recorded.id FROM wine_records recorded WHERE ${recorded.sql}
      UNION SELECT note.wine_id FROM tasting_notes note WHERE ${notes.sql}
      UNION SELECT purchase.wine_id FROM purchases purchase WHERE ${purchases.sql}
      UNION SELECT bottle.wine_id FROM bottles bottle WHERE ${bottles.sql})`,
  };
}

const bandOf = `CASE
  WHEN note.score_100 >= 95 THEN '95_100'
  WHEN note.score_100 >= 90 THEN '90_94'
  WHEN note.score_100 >= 85 THEN '85_89'
  WHEN note.score_100 >= 80 THEN '80_84'
  ELSE 'under_80' END`;

const bands: ScoreBand[] = ["under_80", "80_84", "85_89", "90_94", "95_100"];

function isCurrency(value: string): value is CurrencyCode {
  return (supportedCurrencies as readonly string[]).includes(value);
}

async function computeStats(
  database: D1Database,
  scope: Scope,
  query: WineStatsQuery,
  label: { scope: "personal" | "space"; spaceId: string | null },
): Promise<WineStats> {
  const notes = notesIn(scope, query);
  const purchases = purchasesIn(scope, query);
  const bottles = bottlesIn(scope, query);
  const wines = winesIn(scope, query);
  const everyWine = winesIn(scope, unnarrowed(query));
  const country = countryOf("wine", scope);
  const wishlistMatch = wineMatch("item.wine_id", query, scope);
  const statement = (sql: string, binds: Bind[]) => database.prepare(sql).bind(...binds);

  const [
    noteTotals,
    noteBands,
    noteMonths,
    bestScores,
    wineTotal,
    wineTypes,
    wineCountries,
    wineRegions,
    wineGrapes,
    spendTotals,
    spendYears,
    spendMerchants,
    cheapest,
    cellarStates,
    cellarDays,
    wishlist,
    facetTypes,
    facetCountries,
    facetRegions,
    facetGrapes,
  ] = await database.batch([
    statement(
      `SELECT COUNT(*) AS total, COUNT(note.score_100) AS scored,
        AVG(note.score_100) AS average_score,
        SUM(CASE WHEN note.score_100 >= 90 THEN 1 ELSE 0 END) AS at_or_above_90,
        SUM(CASE WHEN note.would_buy = 'yes' THEN 1 ELSE 0 END) AS buy_yes,
        SUM(CASE WHEN note.would_buy = 'no' THEN 1 ELSE 0 END) AS buy_no,
        SUM(CASE WHEN note.would_buy = 'unsure' THEN 1 ELSE 0 END) AS buy_unsure,
        SUM(CASE WHEN note.would_drink_again = 'yes' THEN 1 ELSE 0 END) AS again_yes,
        SUM(CASE WHEN note.would_drink_again = 'no' THEN 1 ELSE 0 END) AS again_no,
        SUM(CASE WHEN note.would_drink_again = 'unsure' THEN 1 ELSE 0 END) AS again_unsure,
        SUM(CASE WHEN note.memorable = 1 THEN 1 ELSE 0 END) AS memorable,
        AVG(note.pairing_success) AS pairing_success
      FROM tasting_notes note WHERE ${notes.sql}`,
      notes.binds,
    ),
    statement(
      `SELECT ${bandOf} AS band, COUNT(*) AS count FROM tasting_notes note
      WHERE ${notes.sql} AND note.score_100 IS NOT NULL GROUP BY band`,
      notes.binds,
    ),
    statement(
      `SELECT substr(note.tasted_at, 1, 7) AS month, COUNT(*) AS count
      FROM tasting_notes note WHERE ${notes.sql}
      GROUP BY month ORDER BY month DESC LIMIT 12`,
      notes.binds,
    ),
    // Each wine's best score in scope: the top wines, and what value is set against.
    statement(
      `SELECT note.wine_id, note.space_id, MAX(note.score_100) AS score,
        MAX(CASE WHEN note.memorable = 1 THEN 1 ELSE 0 END) AS memorable,
        wine.display_name, wine.producer_name
      FROM tasting_notes note
      JOIN wine_records wine ON wine.id = note.wine_id AND wine.deleted_at IS NULL
      WHERE ${notes.sql} AND note.score_100 IS NOT NULL
      GROUP BY note.wine_id ORDER BY score DESC, wine.display_name LIMIT 2000`,
      notes.binds,
    ),
    statement(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN wine.country_code IS NULL AND ${country.sql} IS NOT NULL THEN 1 ELSE 0 END)
          AS inferred
      FROM wine_records wine WHERE ${wines.sql}`,
      [...country.binds, ...wines.binds],
    ),
    statement(
      `SELECT coalesce(wine.wine_type_free, wine.wine_type, 'unknown') AS key, COUNT(*) AS count
      FROM wine_records wine WHERE ${wines.sql} GROUP BY key ORDER BY count DESC, key`,
      wines.binds,
    ),
    statement(
      `SELECT coalesce(${country.sql}, 'unknown') AS key, COUNT(*) AS count
      FROM wine_records wine WHERE ${wines.sql} GROUP BY key ORDER BY count DESC, key LIMIT 15`,
      [...country.binds, ...wines.binds],
    ),
    statement(
      `SELECT min(wine.region) AS key, COUNT(*) AS count FROM wine_records wine
      WHERE ${wines.sql} AND wine.region IS NOT NULL AND trim(wine.region) <> ''
      GROUP BY lower(trim(wine.region)) ORDER BY count DESC, key LIMIT 10`,
      wines.binds,
    ),
    statement(
      `SELECT min(grape.name_snapshot) AS key, COUNT(DISTINCT grape.wine_id) AS count
      FROM wine_grapes grape JOIN wine_records wine ON wine.id = grape.wine_id
      WHERE ${wines.sql} GROUP BY lower(trim(grape.name_snapshot))
      ORDER BY count DESC, key LIMIT 10`,
      wines.binds,
    ),
    statement(
      `SELECT purchase.currency, COUNT(*) AS purchases, SUM(purchase.quantity) AS bottles,
        SUM(purchase.unit_amount_minor * purchase.quantity) AS total_minor
      FROM purchases purchase WHERE ${purchases.sql}
      GROUP BY purchase.currency ORDER BY total_minor DESC`,
      purchases.binds,
    ),
    statement(
      `SELECT purchase.currency, substr(purchase.purchased_at, 1, 4) AS year,
        SUM(purchase.unit_amount_minor * purchase.quantity) AS total_minor
      FROM purchases purchase WHERE ${purchases.sql}
      GROUP BY purchase.currency, year ORDER BY year`,
      purchases.binds,
    ),
    statement(
      `SELECT purchase.currency, min(purchase.merchant_name) AS name, COUNT(*) AS purchases,
        SUM(purchase.unit_amount_minor * purchase.quantity) AS total_minor
      FROM purchases purchase WHERE ${purchases.sql}
      GROUP BY purchase.currency, lower(trim(purchase.merchant_name))
      ORDER BY total_minor DESC`,
      purchases.binds,
    ),
    // The least each wine was bought for, per currency.
    statement(
      `SELECT purchase.wine_id, purchase.currency, MIN(purchase.unit_amount_minor) AS unit_minor
      FROM purchases purchase WHERE ${purchases.sql}
      GROUP BY purchase.wine_id, purchase.currency`,
      purchases.binds,
    ),
    statement(
      `SELECT bottle.state, COUNT(*) AS count FROM bottles bottle WHERE ${bottles.sql}
      GROUP BY bottle.state`,
      bottles.binds,
    ),
    statement(
      `SELECT AVG(julianday(bottle.opened_at) - julianday(bottle.acquired_at)) AS days
      FROM bottles bottle WHERE ${bottles.sql} AND bottle.opened_at IS NOT NULL
        AND julianday(bottle.opened_at) >= julianday(bottle.acquired_at)`,
      bottles.binds,
    ),
    statement(
      `SELECT COUNT(*) AS active FROM wishlist_items item
      WHERE ${spaceFilter("item", scope).sql} AND item.state = 'active' AND item.deleted_at IS NULL
        ${scope.ownerId === null ? "" : "AND item.created_by_user_id = ?"}
        AND ${wishlistMatch.sql}`,
      [
        JSON.stringify(scope.spaceIds),
        ...(scope.ownerId === null ? [] : [scope.ownerId]),
        ...wishlistMatch.binds,
      ],
    ),
    // What the counts can be narrowed to: everything in scope and period.
    statement(
      `SELECT DISTINCT coalesce(wine.wine_type_free, wine.wine_type) AS value
      FROM wine_records wine WHERE ${everyWine.sql}
        AND coalesce(wine.wine_type_free, wine.wine_type) IS NOT NULL ORDER BY value`,
      everyWine.binds,
    ),
    statement(
      `SELECT DISTINCT ${country.sql} AS value FROM wine_records wine
      WHERE ${everyWine.sql} AND ${country.sql} IS NOT NULL ORDER BY value`,
      [...country.binds, ...everyWine.binds, ...country.binds],
    ),
    statement(
      `SELECT min(trim(wine.region)) AS value FROM wine_records wine
      WHERE ${everyWine.sql} AND wine.region IS NOT NULL AND trim(wine.region) <> ''
      GROUP BY lower(trim(wine.region)) ORDER BY value LIMIT 300`,
      everyWine.binds,
    ),
    statement(
      `SELECT min(trim(grape.name_snapshot)) AS value
      FROM wine_grapes grape JOIN wine_records wine ON wine.id = grape.wine_id
      WHERE ${everyWine.sql} AND trim(grape.name_snapshot) <> ''
      GROUP BY lower(trim(grape.name_snapshot)) ORDER BY value LIMIT 300`,
      everyWine.binds,
    ),
  ]);

  const rows = <T>(result: D1Result | undefined) => (result?.results ?? []) as T[];
  const totals =
    rows<{
      again_no: number | null;
      again_unsure: number | null;
      again_yes: number | null;
      at_or_above_90: number | null;
      average_score: number | null;
      buy_no: number | null;
      buy_unsure: number | null;
      buy_yes: number | null;
      memorable: number | null;
      pairing_success: number | null;
      scored: number;
      total: number;
    }>(noteTotals)[0] ?? null;
  const bandCounts = new Map(
    rows<{ band: ScoreBand; count: number }>(noteBands).map((row) => [row.band, row.count]),
  );
  const scores = rows<{
    display_name: string;
    memorable: number;
    producer_name: string;
    score: number;
    space_id: string;
    wine_id: string;
  }>(bestScores);
  const averageScore = totals?.average_score ?? null;

  // Value: what a point cost, among the wines bought and scored at or above
  // the scope's own average — a cheap wine nobody liked is not good value.
  const scoreByWine = new Map(scores.map((row) => [row.wine_id, row]));
  const bestValue = rows<{ currency: string; unit_minor: number; wine_id: string }>(cheapest)
    .flatMap((row) => {
      const scored = scoreByWine.get(row.wine_id);
      if (scored === undefined || scored.score <= 0 || !isCurrency(row.currency)) return [];
      if (averageScore !== null && scored.score < averageScore) return [];
      return [
        {
          currency: row.currency,
          perPointMinor: Math.round((row.unit_minor / scored.score) * 100) / 100,
          producerName: scored.producer_name,
          score: scored.score,
          spaceId: scored.space_id,
          unitAmountMinor: row.unit_minor,
          wineId: row.wine_id,
          wineName: scored.display_name,
        },
      ];
    })
    .sort((left, right) => left.perPointMinor - right.perPointMinor)
    .slice(0, 5);

  const years = rows<{ currency: string; total_minor: number; year: string }>(spendYears);
  const merchants = rows<{
    currency: string;
    name: string;
    purchases: number;
    total_minor: number;
  }>(spendMerchants);
  const spending = rows<{
    bottles: number;
    currency: string;
    purchases: number;
    total_minor: number;
  }>(spendTotals)
    .filter((row) => isCurrency(row.currency))
    .map((row) => ({
      averageBottleMinor: row.bottles > 0 ? Math.round(row.total_minor / row.bottles) : null,
      bottles: row.bottles,
      byYear: years
        .filter((year) => year.currency === row.currency)
        .map((year) => ({ totalMinor: year.total_minor, year: year.year })),
      currency: row.currency as CurrencyCode,
      purchases: row.purchases,
      topMerchants: merchants
        .filter((merchant) => merchant.currency === row.currency)
        .slice(0, 5)
        .map((merchant) => ({
          name: merchant.name,
          purchases: merchant.purchases,
          totalMinor: merchant.total_minor,
        })),
      totalMinor: row.total_minor,
    }));

  const states = new Map(
    rows<{ count: number; state: string }>(cellarStates).map((row) => [row.state, row.count]),
  );
  const days = rows<{ days: number | null }>(cellarDays)[0]?.days ?? null;
  const buckets = (result: D1Result | undefined) =>
    rows<{ count: number; key: string }>(result).map((row) => ({
      count: row.count,
      key: row.key,
    }));

  const values = (result: D1Result | undefined) =>
    rows<{ value: string }>(result).map((row) => row.value);

  return {
    bestValue,
    facets: {
      countries: values(facetCountries),
      grapes: values(facetGrapes),
      regions: values(facetRegions),
      types: values(facetTypes),
    },
    filters: {
      country: query.country ?? null,
      grape: query.grape ?? null,
      region: query.region ?? null,
      type: query.type ?? null,
    },
    cellar: {
      averageDaysToOpen: days === null ? null : Math.round(days),
      finished: states.get("finished") ?? 0,
      gifted: states.get("gifted") ?? 0,
      opened: states.get("opened") ?? 0,
      owned: states.get("owned") ?? 0,
    },
    period: { from: query.from ?? null, to: query.to ?? null },
    scope: label.scope,
    spaceId: label.spaceId,
    spending,
    tastings: {
      atOrAbove90: totals?.at_or_above_90 ?? 0,
      averageScore: averageScore === null ? null : Math.round(averageScore * 10) / 10,
      byMonth: rows<{ count: number; month: string }>(noteMonths).toReversed(),
      memorable: totals?.memorable ?? 0,
      pairingSuccessAverage:
        totals?.pairing_success == null ? null : Math.round(totals.pairing_success * 10) / 10,
      scoreBands: bands.map((band) => ({ band, count: bandCounts.get(band) ?? 0 })),
      scored: totals?.scored ?? 0,
      topWines: scores.slice(0, 5).map((row) => ({
        memorable: row.memorable === 1,
        producerName: row.producer_name,
        score: row.score,
        spaceId: row.space_id,
        wineId: row.wine_id,
        wineName: row.display_name,
      })),
      total: totals?.total ?? 0,
      wouldBuy: {
        no: totals?.buy_no ?? 0,
        unsure: totals?.buy_unsure ?? 0,
        yes: totals?.buy_yes ?? 0,
      },
      wouldDrinkAgain: {
        no: totals?.again_no ?? 0,
        unsure: totals?.again_unsure ?? 0,
        yes: totals?.again_yes ?? 0,
      },
    },
    wines: {
      byCountry: buckets(wineCountries),
      byGrape: buckets(wineGrapes),
      byRegion: buckets(wineRegions),
      byType: buckets(wineTypes),
      countriesInferred: rows<{ inferred: number | null }>(wineTotal)[0]?.inferred ?? 0,
      total: rows<{ total: number }>(wineTotal)[0]?.total ?? 0,
    },
    wishlist: { active: rows<{ active: number }>(wishlist)[0]?.active ?? 0 },
  };
}

/** The reader's own numbers, across every Space they belong to. Null for no reader. */
export async function getPersonalStats(
  database: D1Database,
  principal: FirebasePrincipal,
  query: WineStatsQuery,
): Promise<WineStats | null> {
  const memberships = await database
    .prepare(
      `SELECT actor.id AS user_id, membership.space_id
      FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
        AND membership.status = 'active'
      JOIN spaces space ON space.id = membership.space_id AND space.deleted_at IS NULL
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL`,
    )
    .bind(principal.firebaseUid)
    .all<{ space_id: string; user_id: string }>();
  const first = memberships.results[0];
  if (first === undefined) return null;
  const spaceIds = memberships.results.map((row) => row.space_id);
  return computeStats(
    database,
    {
      inferredCountries: await inferCountries(database, spaceIds),
      ownerId: first.user_id,
      spaceIds,
    },
    query,
    { scope: "personal", spaceId: null },
  );
}

/** Everyone's numbers in one Space. Null unless the reader is an active member. */
export async function getSpaceStats(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  query: WineStatsQuery,
): Promise<WineStats | null> {
  const member = await database
    .prepare(
      `SELECT 1 AS ok FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
        AND membership.status = 'active' AND membership.space_id = ?
      JOIN spaces space ON space.id = membership.space_id AND space.deleted_at IS NULL
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL`,
    )
    .bind(spaceId, principal.firebaseUid)
    .first<{ ok: number }>();
  if (member === null) return null;
  const scope = {
    inferredCountries: await inferCountries(database, [spaceId]),
    ownerId: null,
    spaceIds: [spaceId],
  };
  return computeStats(database, scope, query, {
    scope: "space",
    spaceId,
  });
}

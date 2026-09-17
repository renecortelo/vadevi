import { execFileSync } from "node:child_process";

/**
 * Seeds clearly fictional demonstration data (§22.3).
 *
 * Everything here is invented. Producers are named after the synthetic pattern
 * the tests already use, so nobody can mistake a row for a real winery, and no
 * row resembles a real person, address, or purchase.
 *
 * This targets the **local** database only. It refuses to run against a remote
 * one, because demonstration data in a real deployment would pollute a Space
 * that people actually use.
 */

const configuration = "wrangler.example.jsonc";
const database = "vadevi-local";

if (process.argv.includes("--remote")) {
  console.error(
    "Demonstration data is local-only. Seeding a deployed database would mix invented rows " +
      "into a Space that people use.",
  );
  process.exit(1);
}

/** Deterministic ULID-shaped identifiers, so re-running replaces rather than duplicates. */
function demoId(suffix: string): string {
  return `01JDEMO${suffix.toUpperCase().padEnd(19, "0").slice(0, 19)}`;
}

const spaceId = demoId("SPACE");
const userId = demoId("USER");
const now = "2026-08-15T12:00:00.000Z";

const wines = [
  {
    country: "ES",
    id: demoId("WINE1"),
    name: "Vinya de Mostra",
    producer: "Celler Sintètic",
    region: "Penedès",
    type: "red",
    vintage: 2021,
  },
  {
    country: "FR",
    id: demoId("WINE2"),
    name: "Cuvée Imaginaire",
    producer: "Domaine Fictif",
    region: "Loire",
    type: "white",
    vintage: 2022,
  },
  {
    country: "IT",
    id: demoId("WINE3"),
    name: "Bianco Inventato",
    producer: "Cantina Esempio",
    region: "Piemonte",
    type: "white",
    vintage: 2020,
  },
  {
    country: "PT",
    id: demoId("WINE4"),
    name: "Tinto Fictício",
    producer: "Quinta Exemplo",
    region: "Douro",
    type: "red",
    vintage: 2019,
  },
];

const notes = [
  { comment: "Bright and direct. Would pour it again.", score: 88, wine: wines[0]! },
  { comment: "Lean, citrus-led, good with the synthetic fish.", score: 84, wine: wines[1]! },
  { comment: "Rounder than expected after an hour open.", score: 90, wine: wines[2]! },
];

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function quote(value: number | string | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

const statements = [
  // Re-running replaces the demonstration rows rather than duplicating them.
  `DELETE FROM tasting_notes WHERE space_id = ${quote(spaceId)}`,
  `DELETE FROM wine_records WHERE space_id = ${quote(spaceId)}`,
  `DELETE FROM space_memberships WHERE space_id = ${quote(spaceId)}`,
  `DELETE FROM spaces WHERE id = ${quote(spaceId)}`,
  `DELETE FROM users WHERE id = ${quote(userId)}`,

  `INSERT INTO users (id, firebase_uid, email_normalized, display_name, preferred_locale, active_space_id, created_at, updated_at)
   VALUES (${quote(userId)}, ${quote("demo-firebase-uid")}, ${quote("demo@example.test")},
     ${quote("Demo Taster")}, 'en', ${quote(spaceId)}, ${quote(now)}, ${quote(now)})`,

  `INSERT INTO spaces (id, type, name, default_locale, created_by_user_id, version, created_at, updated_at)
   VALUES (${quote(spaceId)}, 'personal', ${quote("Demonstration Space")}, 'en', ${quote(userId)}, 1, ${quote(now)}, ${quote(now)})`,

  `INSERT INTO space_memberships (space_id, user_id, role, status, joined_at, version, created_at, updated_at)
   VALUES (${quote(spaceId)}, ${quote(userId)}, 'owner', 'active', ${quote(now)}, 1, ${quote(now)}, ${quote(now)})`,

  ...wines.map(
    (wine) => `INSERT INTO wine_records (
      id, space_id, display_name, normalized_name, producer_name, normalized_producer_name,
      vintage_year, non_vintage, wine_type, country_code, normalized_country_code,
      region, normalized_region, identity_status, created_by_user_id, confirmed_by_user_id,
      version, created_at, updated_at
    ) VALUES (
      ${quote(wine.id)}, ${quote(spaceId)}, ${quote(wine.name)}, ${quote(normalize(wine.name))},
      ${quote(wine.producer)}, ${quote(normalize(wine.producer))}, ${wine.vintage}, 0,
      ${quote(wine.type)}, ${quote(wine.country)}, ${quote(wine.country)},
      ${quote(wine.region)}, ${quote(normalize(wine.region))}, 'confirmed',
      ${quote(userId)}, ${quote(userId)}, 1, ${quote(now)}, ${quote(now)}
    )`,
  ),

  ...notes.map(
    (note, index) => `INSERT INTO tasting_notes (
      id, space_id, wine_id, author_user_id, mode, state, tasted_at, score_100,
      sentiment, comment, version, created_at, updated_at
    ) VALUES (
      ${quote(demoId(`NOTE${index + 1}`))}, ${quote(spaceId)}, ${quote(note.wine.id)},
      ${quote(userId)}, 'quick', 'submitted', ${quote(now)}, ${note.score},
      'like', ${quote(note.comment)}, 1, ${quote(now)}, ${quote(now)}
    )`,
  ),
];

console.info(`Seeding ${wines.length} demonstration wines and ${notes.length} notes...`);
execFileSync(
  "pnpm",
  [
    "exec",
    "wrangler",
    "d1",
    "execute",
    database,
    "--local",
    "--config",
    configuration,
    "--command",
    statements.join(";\n"),
  ],
  { encoding: "utf8", stdio: "inherit" },
);
console.info(
  "Done. Every producer, wine, and note above is invented; none refers to a real winery or person.",
);

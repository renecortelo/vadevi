import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * What a new migration may contain.
 *
 * D1 does not accept `PRAGMA` over its HTTP API. Every migration up to 0014
 * opens with `PRAGMA foreign_keys = ON;`, which is why applying them to a
 * deployed database prints an API error even though the migration itself
 * succeeds: the statement is rejected, the rest apply, and the run is recorded.
 * The line does nothing there in any case — D1 enforces foreign keys itself.
 *
 * Migrations are immutable, so the fourteen that carry it keep carrying it.
 * This is about the fifteenth, and about the noise it would print for every
 * operator who deploys.
 */
const migrationsDirectory = resolve(import.meta.dirname, "../migrations");

/** Written before this was understood. Immutable, so they stay as they are. */
const grandfathered = 14;

function migrationNumber(name: string): number {
  return Number.parseInt(name.slice(0, 4), 10);
}

const files = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const problems: string[] = [];

for (const name of files) {
  if (migrationNumber(name) <= grandfathered) continue;
  const contents = readFileSync(join(migrationsDirectory, name), "utf8");
  if (/^\s*PRAGMA\b/im.test(contents)) {
    problems.push(
      `  ${name} contains a PRAGMA. D1 refuses it over its API and prints an error to\n` +
        `  whoever runs the migration, for no benefit: D1 enforces foreign keys itself.`,
    );
  }
}

// A gap means a file was renamed or lost, and a migration that is never applied
// is the kind of thing only noticed in production.
const numbers = files.map((name) => migrationNumber(name));
numbers.forEach((value, index) => {
  if (value !== index + 1) {
    problems.push(`  Migration numbering jumps at ${files[index]}; they must be consecutive.`);
  }
});

if (problems.length > 0) {
  console.error(`\nMigration checks failed:\n${problems.join("\n")}\n`);
  process.exit(1);
}

console.info(
  `Migrations look right: ${files.length} files, consecutively numbered, ` +
    `and none added after 0014 uses a PRAGMA.`,
);

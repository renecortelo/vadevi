import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

/**
 * Deploy in the one order that is safe.
 *
 * Migrations are forward-only, so they go on before the Worker, never after.
 * Getting that backwards is not a warning — it deploys code that writes columns
 * the database does not have, and every read that names one fails. It happened:
 * a Worker went out ahead of `0020` and listing, opening and creating an event
 * all broke, whether or not the event had a place.
 *
 * The order was written down in three documents and still went wrong, because
 * following it depended on someone remembering which of two commands to paste.
 * So it is a script: migrate, build, deploy, in that order, stopping at the
 * first failure. A migration that fails never reaches the deploy, which is the
 * property the documents could not enforce.
 *
 * Usage: pnpm deploy:preview  (or `--config <file>` for another deployment)
 */

const configFlag = process.argv.indexOf("--config");
const requested = configFlag === -1 ? "wrangler.preview.jsonc" : process.argv[configFlag + 1];

if (requested === undefined || requested.length === 0) {
  console.error("deploy: --config needs a wrangler configuration file.");
  process.exit(1);
}
// Narrowed once, so the helpers below take a string rather than re-checking it.
const config: string = requested;

if (!existsSync(config)) {
  console.error(
    `deploy: ${config} does not exist.\n` +
      "That file is the deployment's own configuration and is deliberately not in\n" +
      "the repository. See docs/self-hosting.md.",
  );
  process.exit(1);
}

/** The D1 database this configuration deploys against. */
function databaseName(): string | null {
  return /"database_name"\s*:\s*"([^"]+)"/.exec(readFileSync(config, "utf8"))?.[1] ?? null;
}

function run(label: string, command: string, args: string[]): void {
  console.log(`\n▶ ${label}\n  ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(
      `\n✘ ${label} failed. Nothing after this step ran, on purpose:\n` +
        "  a Worker deployed ahead of its migrations breaks every read that\n" +
        "  names a column the database does not have yet.",
    );
    process.exit(result.status ?? 1);
  }
}

/** The migration files in the repository, by their `NNNN_name.sql` filenames. */
function localMigrations(): string[] {
  return readdirSync("migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

/**
 * The migrations D1 records as applied — read through `d1 execute`, not through
 * `migrations apply`.
 *
 * `wrangler d1 migrations apply` has hit an intermittent Cloudflare 7403 on its
 * own preflight query (2026-09-07, 2026-09-15), while `d1 execute` against the
 * same `/query` endpoint, with the same token, kept working seconds apart. So
 * the "is anything pending?" question is answered with the call that does not
 * flake, and the flaky `apply` is only ever run when there is real work for it.
 *
 * Returns null when the answer cannot be trusted — the call failed, or a fresh
 * database has no `d1_migrations` table yet — in which case the caller applies
 * migrations the old way rather than assuming the database is current.
 */
function appliedMigrations(db: string): string[] | null {
  const result = spawnSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      db,
      "--remote",
      "--config",
      config,
      "--json",
      "--command",
      "SELECT name FROM d1_migrations",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0 || typeof result.stdout !== "string") return null;
  // `--json` prints a JSON array to stdout; take it from the first bracket so a
  // stray warning line cannot break the parse.
  const start = result.stdout.indexOf("[");
  if (start === -1) return null;
  try {
    const parsed = JSON.parse(result.stdout.slice(start)) as Array<{
      results?: Array<{ name?: unknown }>;
    }>;
    const names = parsed
      .flatMap((block) => block.results ?? [])
      .map((row) => row.name)
      .filter((name): name is string => typeof name === "string");
    return names;
  } catch {
    return null;
  }
}

const database = databaseName();
if (database === null) {
  console.error(`deploy: could not find a database_name in ${config}.`);
  process.exit(1);
}

const migrationCount = readdirSync("migrations").filter((file) => file.endsWith(".sql")).length;
console.log(
  `Deploying with ${config} → D1 "${database}" (${migrationCount} migrations in the repository).`,
);

// 1. The database first, always — but skip the apply when there is provably
//    nothing to apply, so a code-only deploy is not held hostage by the flaky
//    migration preflight. The skip is taken ONLY when the reliable check
//    confirms every local migration is already recorded; any doubt falls back
//    to running the apply.
const applied = appliedMigrations(database);
const pending =
  applied === null ? null : localMigrations().filter((file) => !applied.includes(file));

if (pending !== null && pending.length === 0) {
  console.log(
    "\n▶ Applying migrations\n  skipped — the database already has all " +
      `${localMigrations().length} migrations (checked with d1 execute).`,
  );
} else {
  if (pending !== null) {
    console.log(`\n  ${pending.length} migration(s) to apply: ${pending.join(", ")}`);
  } else {
    console.log("\n  Could not read applied migrations; applying to be safe.");
  }
  run("Applying migrations", "npx", [
    "wrangler",
    "d1",
    "migrations",
    "apply",
    database,
    "--remote",
    "--config",
    config,
  ]);
}

// 2. The bundle. Every interface change lives here; deploying only the Worker
//    ships none of them, which has been mistaken for "the fix did not deploy".
run("Building the web bundle", "pnpm", ["--filter", "@vadevi/web", "build"]);

// 3. The Worker last.
run("Deploying the Worker", "npx", ["wrangler", "deploy", "--config", config]);

console.log(
  "\n✔ Deployed. On the phone, close and reopen the app — or reinstall it from the\n" +
    "  home screen — so the service worker picks up the new bundle. With the old\n" +
    "  one cached, none of this is present.",
);

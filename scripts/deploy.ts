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

const database = databaseName();
if (database === null) {
  console.error(`deploy: could not find a database_name in ${config}.`);
  process.exit(1);
}

const migrationCount = readdirSync("migrations").filter((file) => file.endsWith(".sql")).length;
console.log(
  `Deploying with ${config} → D1 "${database}" (${migrationCount} migrations in the repository).`,
);

// 1. The database first, always.
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

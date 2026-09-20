import { execFileSync } from "node:child_process";

/**
 * Applies D1 migrations to the suite's own local database before the suite.
 *
 * `wrangler dev --local` persists its D1 under the directory it is given;
 * the suite's is `.wrangler/e2e-state`, apart from the developer's, which a
 * fresh checkout or a CI runner does not have either way. Without this the
 * Worker answers 500 for every authenticated read and the browser drills
 * fail for a reason that has nothing to do with the browser.
 */
const e2eStateDirectory = ".wrangler/e2e-state";

export default function globalSetup(): void {
  console.info(`Applying D1 migrations to the end-to-end database in ${e2eStateDirectory}...`);
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "migrations",
      "apply",
      "vadevi-local",
      "--local",
      "--persist-to",
      e2eStateDirectory,
      "--config",
      "wrangler.example.jsonc",
    ],
    { encoding: "utf8", stdio: "inherit" },
  );
}

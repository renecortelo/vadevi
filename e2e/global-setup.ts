import { execFileSync } from "node:child_process";

/**
 * Applies D1 migrations to the local development database before the suite.
 *
 * `wrangler dev --local` persists its D1 under `.wrangler/`, which a fresh
 * checkout or a CI runner does not have. Without this the Worker answers 500
 * for every authenticated read and the browser drills fail for a reason that
 * has nothing to do with the browser.
 */
export default function globalSetup(): void {
  console.info("Applying D1 migrations to the local end-to-end database...");
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
      "--config",
      "wrangler.example.jsonc",
    ],
    { encoding: "utf8", stdio: "inherit" },
  );
}

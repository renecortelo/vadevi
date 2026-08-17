import { defineConfig, devices } from "@playwright/test";

/**
 * Core browser tests.
 *
 * §18.5 expects Playwright on protected `main`. These tests exist to convert
 * the browser drills that were previously only described in prose — offline
 * shell recovery, service-worker update, install guidance, storage pressure,
 * accessibility, and narrow-viewport layout — into evidence a clean clone can
 * reproduce.
 *
 * The suite runs against the production build served by Wrangler at one origin,
 * because a service worker and an installable manifest do not behave the same
 * under the Vite dev server.
 */
const port = 8788;
const baseURL = `http://127.0.0.1:${port}`;

/** The specs that take the network away on purpose. */
const resilience =
  /(offline-shell|offline-writes|service-worker-update|storage-pressure)\.spec\.ts/;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "test-results",
  testIgnore: ["**/global-setup.ts", "**/fixtures/**"],
  // The offline and update drills mutate service-worker and cache state, so
  // they run one at a time against a single origin.
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI === "true",
  retries: process.env.CI === "true" ? 1 : 0,
  reporter: process.env.CI === "true" ? [["github"], ["list"]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      // The performance run is evidence, not a gate: its numbers depend on the
      // machine, so a shared runner would turn them into noise. `pnpm perf`.
      testIgnore: [/performance\.spec\.ts/, resilience],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      /*
        The drills that deliberately break the network, kept apart.

        They cut requests off mid-flight — that is the thing they exist to test —
        and Wrangler has three times not survived it, taking every later test
        with it and turning one broken server into a dozen confusing failures.
        Two attempts to pin the cause were each only half right, so this is
        containment rather than a third guess: when it happens now, it happens
        to these and to nothing else.
      */
      name: "resilience",
      testMatch: resilience,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Not part of `pnpm e2e`, which names the projects it runs. Timings taken
      // on a shared runner are noise, and gating on them means a red build for
      // reasons that have nothing to do with the change. `pnpm perf` runs it.
      name: "performance",
      testMatch: /performance\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // 320 CSS px is the narrowest layout the spec supports.
      name: "chromium-320",
      testMatch: /narrow-layout\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 720 } },
    },
  ],
  webServer: [
    {
      // Identity for the authenticated drills. The emulator uses the synthetic
      // demo-vadevi project and never contacts a real Firebase account.
      command: "pnpm dev:auth",
      url: "http://127.0.0.1:9099/emulator/v1/projects/demo-vadevi/config",
      reuseExistingServer: process.env.CI !== "true",
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `pnpm exec wrangler dev --config wrangler.example.jsonc --local --port ${port}`,
      url: `${baseURL}/health`,
      reuseExistingServer: process.env.CI !== "true",
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});

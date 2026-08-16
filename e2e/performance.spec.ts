import { expect, test } from "@playwright/test";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * The §18.4 performance budgets, measured rather than asserted in prose.
 *
 * This is a **lab** measurement on a throttled profile, not field data. It is
 * worth being exact about the difference, because the budget is written in
 * field terms:
 *
 * - LCP is measured directly, on a 4x-slowed CPU and a Slow-4G network, which
 *   approximates a mid-range phone. A lab LCP under budget is good evidence;
 *   it is not the same claim as p75 across real devices.
 * - INP cannot be measured in a lab at all — it is a p75 over a real session's
 *   interactions. What is measured here is interaction latency: the time from
 *   the click to the next paint, for the interactions the main flow actually
 *   uses. It is the closest honest proxy, and it is reported as that.
 * - The API percentiles are real percentiles, but of a *local* Worker against a
 *   *local* D1 on the same machine. There is no network and no real database
 *   between them, so these are a floor, not a forecast. What they prove is that
 *   the application's own work is not the bottleneck; what a deployment costs on
 *   top of that has to be watched on the deployment.
 *
 * Deliberately excluded from `pnpm e2e`: the numbers depend on the machine, so
 * a shared runner would make them noise. Run it with `pnpm perf`.
 */

/** A mid-range phone, approximately: quarter-speed CPU on a slow connection. */
const cpuSlowdown = 4;
const slow4g = {
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  latency: 150,
  offline: false,
  uploadThroughput: (750 * 1024) / 8,
};

const budgets = {
  apiReadP95: 500,
  interactionP95: 200,
  largestContentfulPaint: 2500,
  quickLogSaveP95: 800,
};

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((first, second) => first - second);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function report(label: string, values: number[], budget: number): string {
  const p95 = Math.round(percentile(values, 0.95));
  const median = Math.round(percentile(values, 0.5));
  const verdict = p95 <= budget ? "within" : "OVER";
  return `${label}: median ${median} ms, p95 ${p95} ms (budget ${budget} ms) — ${verdict}`;
}

test.describe("performance budgets", () => {
  test.describe.configure({ timeout: 600_000 });

  test("meets the §18.4 budgets on a throttled mobile profile", async ({ page }) => {
    const lines: string[] = [];

    // ---- Largest Contentful Paint, throttled ------------------------------
    const session = await page.context().newCDPSession(page);
    await session.send("Network.enable");
    await session.send("Network.emulateNetworkConditions", slow4g);
    await session.send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
    await page.setViewportSize({ width: 390, height: 780 });

    const paints: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      await page.goto("about:blank");
      await page.goto("/", { waitUntil: "load" });
      const lcp = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            let latest = 0;
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) latest = entry.startTime;
            }).observe({ buffered: true, type: "largest-contentful-paint" });
            // The observer keeps reporting until interaction or unload; a
            // settle window is how a lab run decides it has the final one.
            setTimeout(() => resolve(latest), 2500);
          }),
      );
      paints.push(lcp);
    }
    lines.push(report("LCP (sign-in, Slow 4G, 4x CPU)", paints, budgets.largestContentfulPaint));

    // Throttling off for the rest: the API percentiles are about the server,
    // and the interaction proxy is about the application's own work.
    await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await session.send("Network.emulateNetworkConditions", {
      downloadThroughput: -1,
      latency: 0,
      offline: false,
      uploadThroughput: -1,
    });

    await signIn(page);
    await completeOnboarding(page);

    // ---- Common API reads --------------------------------------------------
    // Measured from the requests the application itself makes, read back out of
    // resource timing. Issuing them from the test instead would need the bearer
    // token the app holds, and getting that wrong is how an earlier version of
    // this file ended up timing 404s and reporting them as reads.
    const readSamples = new Map<string, number[]>();
    for (let run = 0; run < 12; run += 1) {
      await page.goto("/memory");
      await page.waitForLoadState("networkidle");
      const entries = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .filter((entry) => entry.name.includes("/api/v1/"))
          .map((entry) => ({ duration: entry.duration, name: new URL(entry.name).pathname })),
      );
      expect(entries.length, "the screen made no API request to measure").toBeGreaterThan(0);
      for (const entry of entries) {
        // Collapse the identifiers so one route is one row.
        const route = entry.name.replace(/\/[0-9A-HJKMNP-TV-Z]{26}/g, "/{id}");
        readSamples.set(route, [...(readSamples.get(route) ?? []), entry.duration]);
      }
    }
    for (const [route, samples] of [...readSamples].sort()) {
      lines.push(report(`API read ${route}`, samples, budgets.apiReadP95));
    }

    // ---- Interaction latency, as a proxy for INP ---------------------------
    const interactions: number[] = [];
    for (let run = 0; run < 12; run += 1) {
      await page.goto("/memory");
      await page.waitForLoadState("networkidle");
      const started = Date.now();
      await page.getByRole("button", { name: /table/i }).click();
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      interactions.push(Date.now() - started);
    }
    lines.push(report("Interaction (Memory view switch)", interactions, budgets.interactionP95));

    // ---- Quick-log save ----------------------------------------------------
    const saves: number[] = [];
    for (let run = 0; run < 10; run += 1) {
      await page.goto("/log/new");
      await page
        .getByLabel(/producer/i)
        .first()
        .fill(`Celler Sintètic ${run}`);
      await page
        .getByLabel(/wine name/i)
        .first()
        .fill(`Vinya de Mostra ${run}`);
      await page.getByRole("button", { name: /review/i }).click();
      const started = Date.now();
      await page.getByRole("button", { name: /^confirm/i }).click();
      await expect(page.getByRole("status").first()).toBeVisible({ timeout: 15_000 });
      saves.push(Date.now() - started);
    }
    lines.push(report("Quick-log save (online)", saves, budgets.quickLogSaveP95));

    console.log(`\n=== §18.4 performance, lab measurement ===\n${lines.join("\n")}\n`);

    // The run is evidence first and a gate second: it fails only if something
    // is over budget, so the numbers still get printed either way.
    expect(lines.filter((line) => line.includes("OVER"))).toEqual([]);
  });
});

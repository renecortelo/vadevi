import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * A registered name's card at a glance and its climate: the varieties its
 * specification lists, its planted area from its article's infobox, and the
 * climate at its point — read from the same file the library is loaded from.
 */
const rioja = (
  JSON.parse(readFileSync(resolve("data/kb/appellations.json"), "utf8")) as {
    climate: { koppen: string; rainfall: number; winkler: string };
    figures: { planted: { amount: number } };
    id: string;
    register: { grapes: unknown[] };
  }[]
).find((entry) => entry.id === "es-rioja")!;

test("a region card shows its figures and its climate", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ height: 844, width: 390 });
  await signIn(page);
  await completeOnboarding(page);
  await page.goto(`/library/regions/${rioja.id}`);
  await page.locator("#interface-locale").selectOption("es");

  const glance = page.locator(".region-glance");
  const spanish = new Intl.NumberFormat("es");
  await expect(glance).toContainText(String(rioja.register.grapes.length), { timeout: 15_000 });
  await expect(glance).toContainText(`${spanish.format(rioja.figures.planted.amount)} ha`);
  // Rioja's article gives hectares: no "≈", nothing converted.
  await expect(glance).not.toContainText("≈");

  const climate = page.locator(".region-climate");
  await expect(climate).toContainText(`(${rioja.climate.koppen})`);
  await expect(climate).toContainText(`${spanish.format(rioja.climate.rainfall)} mm`);
  await expect(climate).toContainText(rioja.climate.winkler);
  await expect(page.locator(".climograph rect")).toHaveCount(12);

  const results = await new AxeBuilder({ page }).include(".library-page").analyze();
  expect(results.violations).toEqual([]);

  await page.screenshot({ fullPage: true, path: test.info().outputPath("region-card.png") });
});

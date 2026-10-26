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
    climate: { elevation: number; koppen: string; rainfall: number; winkler: string };
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
  // The card shows a tenth of a hectare at most, as the title does.
  const spanish = new Intl.NumberFormat("es", { maximumFractionDigits: 1 });
  await expect(glance).toContainText(String(rioja.register.grapes.length), { timeout: 15_000 });
  await expect(glance.locator("strong").nth(1)).toHaveAttribute(
    "title",
    `${spanish.format(rioja.figures.planted.amount)} ha`,
  );
  // Rioja's area is the Ministry's, in hectares: no "≈", nothing converted.
  await expect(glance).not.toContainText("≈");
  await expect(page.locator("#region-glance ~ .section-help")).toContainText(
    "Ministerio de Agricultura (MAPA)",
  );
  // Three figures, one row, on a phone.
  const tops = await glance
    .locator("li")
    .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
  expect(new Set(tops).size).toBe(1);

  // The soil block shares the climate's list style, so name the section.
  const climate = page.locator('section[aria-labelledby="region-climate"] .region-climate');
  await expect(climate).toContainText(`(${rioja.climate.koppen})`);
  await expect(climate).toContainText(`${spanish.format(rioja.climate.rainfall)} mm`);
  await expect(climate).toContainText(rioja.climate.winkler);
  await expect(climate).toContainText(`${spanish.format(rioja.climate.elevation)} m`);
  await expect(page.locator(".climograph rect")).toHaveCount(12);

  const results = await new AxeBuilder({ page }).include(".library-page").analyze();
  expect(results.violations).toEqual([]);

  await page.screenshot({ fullPage: true, path: test.info().outputPath("region-card.png") });

  // A French PDO: area and volume from the customs' harvest declarations.
  await page.goto("/library/regions/fr-chablis");
  await expect(page.locator("#region-glance ~ .section-help")).toContainText("Aduanas de Francia", {
    timeout: 15_000,
  });
  await expect(page.locator(".region-glance li")).toHaveCount(3);
  // An American AVA: its vineyard acres from the rule that established it,
  // 1,005 acres shown as about 406.7 ha, converted from acres.
  await page.goto("/library/regions/us-tracy-hills");
  await expect(page.locator("#region-glance ~ .section-help")).toContainText(
    "Federal Register de EE. UU., la norma que creó la AVA (2006)",
    { timeout: 15_000 },
  );
  await expect(page.locator(".region-glance")).toContainText("≈ 406,7 ha");
  // A Swiss canton: its area and harvest from the federal harvest report,
  // and its most planted grapes from the University of Adelaide's database.
  await page.goto("/library/regions/ch-vaud");
  await expect(page.locator("#region-glance ~ .section-help")).toContainText(
    "Oficina Federal de Agricultura de Suiza (OFAG), vendimia 2025",
    { timeout: 15_000 },
  );
  await expect(page.getByRole("link", { name: "Chasselas", exact: true })).toBeVisible();
  // The names it contains say their level, in words: «Lavaux · AOC regional».
  await expect(page.getByText("· AOC regional").first()).toBeVisible();
  await expect(page.getByText(/library\.levelName/)).toHaveCount(0);
  await page.screenshot({ fullPage: true, path: test.info().outputPath("region-adelaide.png") });
  // An Austrian region: its vineyards from the 2020 survey and its wine from
  // the 2025 harvest report, each credited as the source it is.
  await page.goto("/library/regions/at-kamptal");
  const austrianSources = page.locator("#region-glance ~ .section-help");
  await expect(austrianSources).toContainText("STATISTIK AUSTRIA, censo vitícola 2020 (extracto)", {
    timeout: 15_000,
  });
  await expect(austrianSources).toContainText("STATISTIK AUSTRIA, cosecha de vino 2025 (extracto)");
  // A Portuguese PDO drawn on its island's municipalities: the wine declared
  // there, from Statistics Portugal.
  await page.goto("/library/regions/pt-pico");
  await expect(page.locator("#region-glance ~ .section-help")).toContainText(
    "Instituto Nacional de Estatística (INE) de Portugal, vino declarado 2025 (CC BY 4.0)",
    { timeout: 15_000 },
  );
  // A name no official source gives a figure for: its own body's, the figure
  // and who gives it, linked, never the page's sentence — Roero's vineyards,
  // from its consorzio.
  await page.goto("/library/regions/it-roero");
  await expect(page.locator(".region-glance")).toContainText("ha", { timeout: 15_000 });
  await expect(
    page.locator("#region-glance ~ .section-help").getByRole("link", {
      name: "Consorzio di Tutela del Roero",
    }),
  ).toHaveAttribute("href", "https://www.consorziodelroero.it/en/origins-and-history/");
  // An Australian GI zone: its vineyard area from the Australian Bureau of
  // Statistics.
  await page.goto("/library/regions/au-barossa");
  await expect(page.locator("#region-glance ~ .section-help")).toContainText(
    "Oficina de Estadística de Australia (ABS), viñedos 2014-15 (CC BY 4.0)",
    { timeout: 15_000 },
  );
  // The soil at a name's point: clay, silt and sand, and its pH in words.
  await page.goto("/library/regions/ar-angaco");
  const soil = page.locator('section[aria-labelledby="region-soil"]');
  await expect(soil).toContainText("Arcilla", { timeout: 15_000 });
  await expect(soil).toContainText("alcalino");
  await expect(soil).toContainText("SoilGrids 2.0");
  // The new soil block too: no serious accessibility fault on this card.
  const soilAxe = await new AxeBuilder({ page }).include(".library-page").analyze();
  expect(soilAxe.violations).toEqual([]);
  await page.goto(`/library/regions/${rioja.id}`);
  // Rioja's point falls in Logroño: its soil is read at the nearest point
  // that has one, and the card says how far away.
  await expect(page.locator('section[aria-labelledby="region-soil"]')).toContainText(
    "Leído a 1,4 km",
    { timeout: 15_000 },
  );
  // On a wide screen the three figures stay on one row and the chart keeps
  // a phone's proportions.
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.locator(".region-climograph").scrollIntoViewIfNeeded();
  expect((await page.locator(".climograph").boundingBox())!.width).toBeLessThanOrEqual(420);
  await page.screenshot({ path: test.info().outputPath("region-card-wide.png") });
});

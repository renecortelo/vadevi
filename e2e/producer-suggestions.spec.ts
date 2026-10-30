import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * The producer field suggests the wineries the library knows (from Wikidata
 * and OpenStreetMap, one static list searched in the browser)
 * as the reader types: part of a name is enough.
 */
test("the producer field suggests a known winery from part of its name", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/log/new");
  await page.locator("#producer-name").fill("Antin");
  await expect(page.locator('datalist option[value="Marchesi Antinori"]')).toHaveCount(1, {
    timeout: 15_000,
  });
});

test("the producer field also suggests a winery only OpenStreetMap maps", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/log/new");
  await page.locator("#producer-name").fill("Zimmerl");
  await expect(page.locator('datalist option[value="Weingut Klaus Zimmerling"]')).toHaveCount(1, {
    timeout: 15_000,
  });
});

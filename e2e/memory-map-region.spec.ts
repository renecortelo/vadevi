import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

test("the map's region toggle renders without error", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/log/new");
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel(/producer/i)
    .first()
    .fill("Celler Origen");
  await page
    .getByLabel(/wine name/i)
    .first()
    .fill("Vinya Regio");
  await page.getByRole("button", { name: /review/i }).click();
  await page.getByRole("button", { name: /^confirm/i }).click();
  await page.waitForTimeout(1500);

  await page.goto("/memory");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^mapa$|^map$/i }).click();
  await page.getByRole("button", { name: /de dónde vienen|where they're from/i }).click();
  // With no place provider in the e2e config, region points are empty by design;
  // the branch must render its empty state rather than throw.
  await expect(page.getByText(/aún no hay regiones|no regions placed/i)).toBeVisible();
  // And back to venue without error.
  await page.getByRole("button", { name: /dónde caté|where i tasted/i }).click();
  await expect(page.locator("svg.points-map__canvas")).toHaveCount(0);
});

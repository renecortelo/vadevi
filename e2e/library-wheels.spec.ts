import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * The library's wheels: the aroma vocabulary narrowed by family and group to
 * one aroma, with the grapes whose sources name it; and the colours of wine
 * by kind and hue. Each part is a button; the centre steps back out.
 */
test("the aroma and colour wheels narrow to one aroma or one colour", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ height: 900, width: 430 });
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/wheels");
  await page.locator("#interface-locale").selectOption("es");

  const wheel = page.getByRole("group", { name: "Aromas", exact: true });
  await expect(wheel).toBeVisible({ timeout: 15_000 });
  // Nine families around the centre.
  await expect(wheel.getByRole("button", { name: "Fruta", exact: true })).toBeVisible();
  await page.screenshot({ fullPage: true, path: test.info().outputPath("wheel-aromas.png") });

  // Into the fruit, then red fruit, then raspberry: its grapes.
  await wheel.getByRole("button", { name: "Fruta", exact: true }).click();
  await wheel.getByRole("button", { name: "Frambuesa" }).click();
  await expect(page.locator(".wheel-choice__title")).toContainText("frambuesa", {
    ignoreCase: true,
  });
  await expect(page.locator(".wheel-choice .library-chips li").first()).toBeVisible({
    timeout: 15_000,
  });
  await page.screenshot({ fullPage: true, path: test.info().outputPath("wheel-raspberry.png") });

  const results = await new AxeBuilder({ page }).include(".library-page").analyze();
  expect(results.violations).toEqual([]);

  // Back out through the centre.
  await wheel
    .getByRole("button", { name: /Volver desde/ })
    .first()
    .click();

  // The colours: a red wine's ruby.
  await page.getByRole("button", { name: "Colores", exact: true }).click();
  const colours = page.getByRole("group", { name: "Colores", exact: true });
  await colours.getByRole("button", { name: "Rubí" }).click();
  await expect(page.locator(".wheel-choice__title")).toContainText("Rubí");
  await page.screenshot({ fullPage: true, path: test.info().outputPath("wheel-colours.png") });
});

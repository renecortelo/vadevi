import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * The library's wheels: the aroma vocabulary narrowed by family and group to
 * one aroma, with the grapes whose sources name it; and the colours of wine
 * by kind and hue. The level's parts are listed as buttons beneath the ring,
 * which a keyboard and a screen reader use; a button steps back out.
 */
test("the aroma and colour wheels narrow to one aroma or one colour", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ height: 900, width: 430 });
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/wheels");
  await page.locator("#interface-locale").selectOption("es");

  const level = (name: string) => page.getByRole("list", { name, exact: true });
  await expect(level("Aromas: Aromas")).toBeVisible({ timeout: 15_000 });
  // Nine families around the ring, and listed beneath it.
  await expect(level("Aromas: Aromas").getByRole("button")).toHaveCount(9);
  await page.screenshot({ fullPage: true, path: test.info().outputPath("wheel-aromas.png") });

  // Into the fruit, then red fruit, then raspberry: its grapes.
  await page.getByRole("button", { name: "Fruta", exact: true }).click();
  await page.getByRole("button", { name: "Fruta roja", exact: true }).click();
  await page.getByRole("button", { name: "frambuesa", exact: true }).click();
  await expect(page.getByRole("button", { name: "frambuesa", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".wheel-choice .library-chips li").first()).toBeVisible({
    timeout: 15_000,
  });
  await page.screenshot({ fullPage: true, path: test.info().outputPath("wheel-raspberry.png") });

  const results = await new AxeBuilder({ page }).include(".library-page").analyze();
  expect(results.violations).toEqual([]);

  // Back out a level.
  await page.getByRole("button", { name: /Volver desde/ }).click();
  await expect(level("Aromas: Fruta")).toBeVisible();

  // The colours: a red wine's ruby.
  await page.getByRole("button", { name: "Colores", exact: true }).click();
  await page.getByRole("button", { name: "Tinto", exact: true }).click();
  await page.getByRole("button", { name: "Rubí", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rubí", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.screenshot({ fullPage: true, path: test.info().outputPath("wheel-colours.png") });
});

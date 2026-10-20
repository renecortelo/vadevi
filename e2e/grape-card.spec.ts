import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * A grape's card at a glance: its aromas drawn and named in the reader's
 * language, and as a small ring of their families, and acidity, tannin and body as three steps — a value no source
 * gives says so instead of showing an empty bar. Grenache's sources give low
 * acidity and tannin and no body.
 */
test("a grape card shows its aromas and its structure at a glance", async ({ page }) => {
  test.setTimeout(120_000);
  // A phone's width: the card is read in the cellar, glass in hand.
  await page.setViewportSize({ height: 844, width: 390 });
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/grapes/grenache");
  await page.locator("#interface-locale").selectOption("es");

  const aromas = page.locator(".aroma-grid li");
  await expect(aromas.first()).toContainText("frambuesa", { timeout: 15_000 });
  await expect(aromas).toContainText([
    "frambuesa",
    "fresa",
    "pimienta blanca",
    "cuero",
    "alquitrán",
  ]);
  await expect(page.locator(".aroma-grid .aroma-icon")).toHaveCount(5);
  // The small ring of families, in the wheel's order: two fruits, a spice,
  // one earthy and one animal — and the way to the whole wheel.
  const families = page.getByRole("list", { name: "Por familia" }).getByRole("listitem");
  await expect(families).toHaveText([
    "Fruta2",
    "Especias1",
    "Tierra y mineral1",
    "Animal y sabroso1",
  ]);
  await expect(page.getByRole("link", { name: "Ver la rueda de aromas" })).toHaveAttribute(
    "href",
    "/library?tab=wheels",
  );

  const bars = page.locator(".library-bar");
  await expect(bars).toHaveCount(5);
  await expect(bars.nth(0)).toContainText("Baja");
  await expect(bars.nth(0).locator(".library-gauge i")).toHaveAttribute("style", /--to: 25%/);
  await expect(bars.nth(2)).toHaveClass(/library-bar--none/);
  await expect(bars.nth(2)).toContainText("sin dato en las fuentes");
  // Alcohol, from its quote: "a relatively high alcohol content".
  await expect(bars.nth(3)).toContainText("Alta");
  await expect(bars.nth(4)).toContainText("Seco o dulce");

  const results = await new AxeBuilder({ page }).include(".library-page").analyze();
  expect(results.violations).toEqual([]);

  await page.screenshot({ fullPage: true, path: test.info().outputPath("grape-card.png") });

  // A range: Sémillon makes "dry and sweet white wines", so its bar runs the
  // whole way. A white grape has no tannin gauge, rather than an empty one.
  await page.goto("/library/grapes/semillon");
  const sweetness = page.locator(".library-bar").nth(3);
  await expect(sweetness).toContainText("De seco a dulce", { timeout: 15_000 });
  await expect(page.locator(".library-bar")).toHaveCount(4);
  await expect(page.locator(".library-bars")).not.toContainText("Tanino");
  await expect(sweetness.locator(".library-gauge i")).toHaveAttribute(
    "style",
    /--from: 0%; --to: 100%/,
  );
  await page.screenshot({ fullPage: true, path: test.info().outputPath("grape-range.png") });
});

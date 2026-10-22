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
  // The wheel keeps the way back to the grape, and the ways back chain: from
  // the wheel to another grape, back to the wheel, and on back to Grenache —
  // while the shelves change too.
  await page.getByRole("link", { name: "Ver la rueda de aromas" }).click();
  await expect(page.getByRole("link", { name: "← Volver a Garnacha" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Fruta", exact: true }).click();
  await page.getByRole("button", { name: "Fruta roja", exact: true }).click();
  await page.getByRole("button", { name: "frambuesa", exact: true }).click();
  const another = page.locator(".wheel-choice .library-chips a").filter({ hasNotText: "Garnacha" });
  await another.first().click();
  await page
    .getByRole("link", { name: "← Volver a Ruedas de aromas, colores y maridajes" })
    .click();
  await page.getByRole("button", { name: "Uvas", exact: true }).click();
  await page.getByRole("button", { name: "Ruedas", exact: true }).click();
  await page.getByRole("link", { name: "← Volver a Garnacha" }).click();
  await expect(page).toHaveURL(/\/library\/grapes\/grenache$/);
  await expect(page.locator(".aroma-grid li").first()).toContainText("frambuesa", {
    timeout: 15_000,
  });

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

  // A fact read from an open-access article quotes it and links it, though it
  // comes first: Cabernet Franc's acidity and tannins. The card's own article
  // is still Wikipedia's.
  await page.goto("/library/grapes/cabernet-franc");
  const evidence = page.locator(".library-evidence");
  await expect(evidence).toBeVisible({ timeout: 15_000 });
  await evidence.locator("summary").click();
  const fromPaper = evidence.locator("li", { hasText: "moderate tannins" });
  await expect(fromPaper).toHaveCount(2);
  // Each value in the reader's language: acidity «Alta», tannins «Media».
  await expect(fromPaper.locator("strong")).toHaveText(["Alta", "Media"]);
  await expect(fromPaper.first().getByRole("link", { name: "(doi.org)" })).toHaveAttribute(
    "href",
    "https://doi.org/10.3390/insects16050497",
  );
  await expect(
    evidence.getByRole("link", { name: "Leer el artículo en Wikipedia" }),
  ).toHaveAttribute("href", /wikipedia\.org/);

  // A fact said of one place's wine says so and links the place: Furmint's
  // body, read from what Tokaj's dry varietal wines are.
  await page.goto("/library/grapes/furmint");
  const body = page.locator(".library-bar", { hasText: "Cuerpo" });
  await expect(body).toContainText("Alta", { timeout: 15_000 });
  await expect(body.getByRole("link", { name: "Dicho del vino de Tokaj" })).toHaveAttribute(
    "href",
    "/library/regions/hu-tokaj",
  );
});

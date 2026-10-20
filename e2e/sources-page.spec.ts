import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * Sources and licences, reached from About: every source of the library in
 * one place, each with what it gives and its terms in the reader's language.
 */
test("About leads to the library's sources and their licences", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/about");
  await page.locator("#interface-locale").selectOption("es");
  await page.getByRole("link", { name: /Fuentes y licencias/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Fuentes y licencias" })).toBeVisible({
    timeout: 15_000,
  });
  const texts = page.getByRole("region", { name: "Textos y nombres" });
  await expect(texts.getByRole("link", { name: "Wikipedia" })).toHaveAttribute(
    "href",
    "https://www.wikipedia.org/",
  );
  await expect(texts).toContainText("CC BY-SA 4.0");
  // Terms that are not a licence's name are said in the reader's language.
  await expect(page.getByRole("region", { name: "Registros de nombres protegidos" })).toContainText(
    "textos oficiales: solo se toman sus hechos",
  );
  await expect(page.getByText("Nada se copia de obras comerciales sobre vino.")).toBeVisible();
  await page.screenshot({ fullPage: true, path: test.info().outputPath("sources.png") });
});

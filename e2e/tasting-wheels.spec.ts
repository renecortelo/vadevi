import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * The detailed tasting picks its colour on the colour wheel — only a red's
 * colours for a red — and finds its aromas on the aroma wheel, which add to
 * the nose's cues like the others.
 */
test("a tasting picks its colour and its aromas on the wheels", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ height: 900, width: 430 });
  await signIn(page);
  await completeOnboarding(page);
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("firebase:authUser:"));
    return key === undefined
      ? ""
      : (JSON.parse(localStorage.getItem(key) ?? "{}").stsTokenManager?.accessToken ?? "");
  });
  const headers = { Authorization: `Bearer ${token}` };
  const api = "http://127.0.0.1:8788/api/v1";
  const me = await page.request.get(`${api}/me/bootstrap`, { headers });
  const spaceId = (await me.json()).data.user.activeSpaceId as string;
  const wine = await page.request.post(`${api}/spaces/${spaceId}/wines`, {
    data: {
      displayName: "Negre de la Roda",
      identityStatus: "confirmed",
      producerName: "Celler Roda",
      wineType: "red",
    },
    headers: { ...headers, "Idempotency-Key": "R".repeat(43) },
  });
  expect(wine.ok(), await wine.text()).toBeTruthy();
  const wineId = (await wine.json()).data.wine.id as string;

  await page.goto(`/wines/${wineId}/taste`);
  await page.locator("#interface-locale").selectOption("es");

  // A red's colours only: the wheel is the red one, with no white or rosé.
  const colours = page.getByRole("list", { name: "Tonalidad: Tinto", exact: true });
  await expect(colours).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Paja", exact: true })).toHaveCount(0);
  await colours.getByRole("button", { name: "Rubí", exact: true }).click();
  await expect(colours.getByRole("button", { name: "Rubí", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // The colour names its family, which was not chosen yet.
  await expect(page.getByLabel("Familia de color")).toHaveValue("red");
  await page.screenshot({ fullPage: true, path: test.info().outputPath("tasting-colour.png") });

  // The nose: the aroma wheel, folded until asked for.
  await page.getByRole("button", { name: /Nariz/ }).click();
  await page.getByRole("button", { name: "Elegir en la rueda de aromas" }).click();
  await page.getByRole("button", { name: "Fruta", exact: true }).click();
  await page.getByRole("button", { name: "Fruta roja", exact: true }).click();
  await page.getByRole("button", { name: "frambuesa", exact: true }).click();
  await page.getByRole("button", { name: "Volver a Fruta" }).click();
  await page.getByRole("button", { name: "Volver a Aromas" }).click();
  await page.getByRole("button", { name: "Flores", exact: true }).click();
  await page.getByRole("button", { name: "violeta", exact: true }).click();
  await expect(page.getByRole("button", { name: "violeta", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Both are cues of the nose now: raspberry from the library's vocabulary,
  // violet the cue the form already offered.
  await expect(page.getByRole("checkbox", { name: "frambuesa" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Violeta" })).toBeChecked();
  await page.screenshot({ fullPage: true, path: test.info().outputPath("tasting-aromas.png") });

  const results = await new AxeBuilder({ page })
    .include(".wheel-field")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  // Touching an aroma again takes it away.
  await page.getByRole("button", { name: "violeta", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Violeta" })).not.toBeChecked();
});

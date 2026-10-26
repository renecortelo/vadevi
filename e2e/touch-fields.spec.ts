import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * On a phone, iOS zooms the page into any field whose text is under 16 px and
 * leaves it shifted; and the bottom bar, pinned to the screen's foot, rides on
 * top of the keyboard. Every typing field on a touch screen is 16 px or more,
 * and the bar steps aside while one has focus.
 */
test.use({ hasTouch: true, isMobile: true, viewport: { height: 844, width: 390 } });

const typing =
  'input:not([type="button"], [type="checkbox"], [type="file"], [type="radio"], [type="range"], [type="submit"], [type="hidden"]), select, textarea';

test("typing fields never make a phone zoom, and the bar steps aside", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await completeOnboarding(page);
  await page.locator("#interface-locale").selectOption("es");

  for (const path of ["/library", "/log/new", "/memory", "/stats"]) {
    await page.goto(path);
    await page.locator("main").waitFor();
    const sizes = await page
      .locator(typing)
      .evaluateAll((fields) =>
        fields
          .filter((field) => (field as HTMLElement).offsetParent !== null)
          .map((field) => Number.parseFloat(getComputedStyle(field).fontSize)),
      );
    for (const size of sizes) expect(size, path).toBeGreaterThanOrEqual(16);
  }

  // The grapes' search: the bar goes while the keyboard would be up.
  await page.goto("/library");
  await page.getByRole("button", { name: "Uvas", exact: true }).click();
  const search = page.locator(".library-page").locator(typing).first();
  await search.click();
  await search.pressSequentially("garn");
  await expect(page.locator(".primary-nav")).toBeHidden();
  await search.blur();
  await expect(page.locator(".primary-nav")).toBeVisible();
});

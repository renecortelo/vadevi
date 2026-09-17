import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * Adding a wine from the screen that needs one.
 *
 * The cellar, the wishlist and the price list each needed a wine before they
 * could record anything, and offered only a list of wines already saved. Buying
 * a bottle you had never logged meant leaving, logging it, and finding your way
 * back — the wrong order for the thing you were actually doing.
 */
const screens = [
  { name: "cellar", path: "/cellar" },
  { name: "wishlist", path: "/wishlist" },
  { name: "prices", path: "/shop" },
];

test.describe("adding a wine where it is needed", () => {
  test.describe.configure({ timeout: 240_000 });

  for (const screen of screens) {
    test(`can be done without leaving ${screen.name}`, async ({ page }) => {
      await signIn(page);
      await completeOnboarding(page);
      await page.goto(screen.path);
      await page.waitForLoadState("networkidle");

      // The picker's own select, by id. A label match now also catches the
      // filter input beside it, and the first combobox on the page is the
      // Space switcher in the shell — neither is what this test means.
      const picker = page.locator("select#wine-picker");
      await picker.selectOption("__add__");
      await page.getByLabel(/producer/i).fill("Celler Sintètic");
      await page.getByLabel(/wine name/i).fill(`Vinya ${screen.name}`);
      await page.getByRole("button", { name: /add wine/i }).click();

      // The new wine is selected straight away: having to find it again in the
      // list afterwards would be most of the annoyance still there.
      await expect(picker).not.toHaveValue("", { timeout: 30_000 });
      await expect(picker).toContainText(`Vinya ${screen.name}`);
    });
  }
});

/**
 * Choosing wines for an event, while the list moves.
 *
 * The event screens used to resolve a selection against the visible list, which
 * was only ever correct because that list never changed. Searching changes it:
 * a wine ticked before a search and absent from the results would have been
 * dropped from the flight without a word.
 */
test("a wine ticked before a search survives it into the flight", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);

  for (const name of ["Alfa Uno", "Beta Dos"]) {
    await page.goto("/log/new");
    await page.waitForLoadState("networkidle");
    await page
      .getByLabel(/producer/i)
      .first()
      .fill("Celler Vuelo");
    await page
      .getByLabel(/wine name/i)
      .first()
      .fill(name);
    await page.getByRole("button", { name: /review/i }).click();
    await page.getByRole("button", { name: /^confirm/i }).click();
    await page.waitForTimeout(1800);
  }

  await page.goto("/sessions/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/name/i).first().fill("Cata del vuelo");

  // Tick Alfa, then filter so that only Beta matches.
  const alfa = page.locator("label.wine-picker", { hasText: "Alfa Uno" }).locator("input");
  await expect(alfa).toBeVisible();
  await alfa.check();

  const filter = page.locator(".wine-picker-field__filter").last();
  await filter.fill("Beta");
  await page.waitForTimeout(900);

  // Alfa is filtered out of the results but stays on screen, still ticked.
  const alfaAfter = page.locator("label.wine-picker", { hasText: "Alfa Uno" }).locator("input");
  await expect(alfaAfter).toBeChecked();
});

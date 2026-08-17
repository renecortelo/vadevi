import { expect, test } from "@playwright/test";

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

      const picker = page.getByLabel(/wine/i).first();
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

import { expect, test } from "@playwright/test";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * Correcting things after they exist.
 *
 * A bottle logged in a restaurant is logged in a hurry, and a Space named in a
 * hurry stayed named that way. Neither could be changed from the interface: the
 * only way to fix a wine was to log it again, which leaves two wines where
 * there is one bottle.
 */
test.describe("correcting a wine", () => {
  test.describe.configure({ timeout: 180_000 });

  test("can be done from Wine Memory, and the card shows the correction", async ({ page }) => {
    await signIn(page);
    await completeOnboarding(page);

    await page.goto("/log/new");
    await page
      .getByLabel(/producer/i)
      .first()
      .fill("Celler Sintetic");
    await page
      .getByLabel(/wine name/i)
      .first()
      .fill("Vinya Editable");
    await page.getByRole("button", { name: /review/i }).click();
    await page.getByRole("button", { name: /^confirm/i }).click();

    await page.goto("/memory");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("article.wine-card").first()).toBeVisible({ timeout: 30_000 });

    await page
      .getByRole("button", { name: /^edit$/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel(/vintage/i).fill("2021");
    await dialog.getByRole("button", { name: /save changes/i }).click();

    await expect(dialog).toBeHidden({ timeout: 30_000 });
    // The list is refetched rather than patched in place, so this proves the
    // correction reached the server and came back.
    await expect(page.locator("article.wine-card").first()).toContainText("2021", {
      timeout: 30_000,
    });
  });
});

test.describe("renaming a Space", () => {
  test.describe.configure({ timeout: 180_000 });

  test("an owner can rename it, and the switcher follows", async ({ page }) => {
    await signIn(page);
    await completeOnboarding(page);
    await page.goto("/spaces");
    await page.waitForLoadState("networkidle");

    const field = page.getByLabel(/space name|nombre/i).first();
    await expect(field).toBeVisible();
    await field.fill("Renamed By Its Owner");
    await page.getByRole("button", { name: /rename space/i }).click();

    // The top bar reads the name from bootstrap, not from this screen, so it is
    // the honest place to check that the rename actually took.
    await expect(page.getByLabel(/space/i).first()).toContainText("Renamed By Its Owner", {
      timeout: 30_000,
    });
  });
});

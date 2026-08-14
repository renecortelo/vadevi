import { expect, test, type Page } from "@playwright/test";

/**
 * §14.4 requires a warning before large offline photo accumulation, and states
 * that a failed photo persistence must not lose the text note.
 *
 * The browser will not fill its own quota on demand, so these tests stub
 * `navigator.storage.estimate` before the app boots and assert on the notice the
 * app derives from it.
 */
async function stubQuota(page: Page, ratio: number) {
  await page.addInitScript((usedRatio: number) => {
    const quota = 1_000_000_000;
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        estimate: async () => ({ quota, usage: Math.round(quota * usedRatio) }),
        persisted: async () => false,
      },
    });
  }, ratio);
}

test.describe("offline storage pressure", () => {
  test("stays quiet well below the warning threshold", async ({ page }) => {
    await stubQuota(page, 0.2);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/storage is nearly full|storage is full/i)).toHaveCount(0);
  });

  test("warns at 70% of the quota estimate", async ({ page }) => {
    await stubQuota(page, 0.75);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/offline storage is nearly full/i)).toBeVisible();
  });

  test("explains at 90% that photos stop being kept but notes still save", async ({ page }) => {
    await stubQuota(page, 0.95);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const notice = page.getByText(/offline storage is full/i);
    await expect(notice).toBeVisible();
    // The critical message must not imply text notes are lost.
    await expect(notice).toContainText(/text notes still save/i);
  });

  test("announces the notice politely rather than as an alert", async ({ page }) => {
    await stubQuota(page, 0.95);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const status = page.locator('[role="status"]', { hasText: /offline storage is full/i });
    await expect(status).toHaveCount(1);
    await expect(status).toHaveAttribute("aria-live", "polite");
  });
});

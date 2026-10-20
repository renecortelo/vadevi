import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * A device that holds no session draws the sign-in screen at once, without
 * waiting for the deployment's configuration and Google's sign-in script; a
 * device that holds one waits as before, so it never flashes the sign-in
 * screen on its way into the app.
 */
const slowConfig = async (page: Page) =>
  page.route("**/runtime-config", async (route) => {
    await new Promise((settle) => setTimeout(settle, 4_000));
    await route.continue();
  });

test("the sign-in screen is drawn at once on a device that never signed in", async ({ page }) => {
  await slowConfig(page);
  await page.goto("/");
  // Well before the configuration arrives.
  await expect(page.getByRole("button", { name: /Google/ })).toBeVisible({ timeout: 2_000 });
});

test("a device with a session waits for it, and never shows the sign-in screen", async ({
  page,
}) => {
  await slowConfig(page);
  await signIn(page);
  await page.waitForTimeout(1_500);
  await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
  await completeOnboarding(page);
  await expect(page.locator("nav[aria-label='Primary']")).toBeVisible();
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * Browser coverage for the authenticated screens.
 *
 * These were previously covered only by server-rendered component tests, which
 * cannot see a real focus ring, a real layout overflow, or an axe violation
 * that depends on computed styles. This closes that gap.
 */
test.describe("authenticated screens", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await completeOnboarding(page);
  });

  const screens = [
    { path: "/", name: "home" },
    { path: "/memory", name: "wine memory" },
    { path: "/log/new", name: "quick log" },
    { path: "/log/identify", name: "identify" },
    { path: "/cellar", name: "cellar" },
    { path: "/settings/data", name: "data and privacy" },
  ] as const;

  for (const screen of screens) {
    test(`has no serious or critical axe violation on ${screen.name}`, async ({ page }) => {
      await page.goto(screen.path);
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const blocking = results.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      );
      expect(
        blocking.map((violation) => `${violation.id} (${violation.impact}): ${violation.help}`),
      ).toEqual([]);
    });
  }

  test("reaches the identification screen and keeps manual entry available", async ({ page }) => {
    await page.goto("/log/identify");
    await page.waitForLoadState("networkidle");

    // Scanning is optional; the manual path must always be present, per AC-014.
    await expect(page.getByRole("button", { name: /start scanning/i })).toBeVisible();
    await expect(page.getByLabel(/or type what you can read/i)).toBeVisible();
  });

  test("offers data export and deletion from the data and privacy screen", async ({ page }) => {
    await page.goto("/settings/data");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: /export json/i })).toBeVisible();
    // Account deletion must stay disabled until the typed confirmation matches.
    const deleteButton = page.getByRole("button", { name: /schedule account deletion/i });
    await expect(deleteButton).toBeDisabled();
    await page.locator("#account-confirmation").fill("DELETE");
    await expect(deleteButton).toBeEnabled();
  });

  test("shows the AGPL source offer required for network use", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const link = page.getByRole("link", { name: /source code/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /^https?:\/\//);
  });
});

test.describe("authenticated screens at 320 CSS px", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("has no horizontal overflow on the main flow", async ({ page }) => {
    await signIn(page);
    await completeOnboarding(page);

    for (const path of ["/", "/memory", "/log/identify", "/settings/data"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(overflow.scrollWidth, `${path} overflows at 320 px`).toBeLessThanOrEqual(
        overflow.clientWidth + 1,
      );
    }
  });
});

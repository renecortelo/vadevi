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
    { path: "/about", name: "about" },
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

  test("reaches identification by clicking, not only by URL", async ({ page }) => {
    // A screen that exists but has no path to it is invisible to a real user.
    // Acceptance found exactly that: identification shipped unreachable.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: /identify a bottle/i }).click();
    await expect(page).toHaveURL(/\/log\/identify$/);
    await expect(page.getByRole("button", { name: /start scanning/i })).toBeVisible();

    // And from Quick Log, beside the manual fields it replaces.
    await page.goto("/log/new");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: /scan or read a label/i }).click();
    await expect(page).toHaveURL(/\/log\/identify$/);
  });

  test("keeps manual entry available on the identification screen", async ({ page }) => {
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

  test("offers the source AGPL-3.0 requires, one click from anywhere", async ({ page }) => {
    await page.goto("/memory");
    await page.waitForLoadState("networkidle");

    // §13 obliges an operator to offer the Corresponding Source to anyone using
    // the application over a network. It used to sit in the shell's footer on
    // every screen; it now lives on About, which is reachable from the primary
    // navigation on every screen. This walks that path rather than assuming it.
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: /about/i })
      .click();
    await expect(page).toHaveURL(/\/about$/);

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

test.describe("theme preference", () => {
  test("switches the palette and remembers the choice across a reload", async ({ page }) => {
    await signIn(page);
    await completeOnboarding(page);

    const control = page.getByLabel(/^theme$/i);
    await expect(control).toBeVisible();

    await control.selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // The choice is stored on the account, so it survives a full reload rather
    // than only living in component state.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await control.selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    // `system` removes the attribute so the page keeps following the device.
    await control.selectOption("system");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  });

  test("has no serious or critical axe violation in dark mode", async ({ page }) => {
    await signIn(page);
    await completeOnboarding(page);
    await page.getByLabel(/^theme$/i).selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    for (const path of ["/", "/memory", "/about", "/settings/data"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const blocking = results.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      );
      expect(blocking.map((violation) => `${path} ${violation.id} (${violation.impact})`)).toEqual(
        [],
      );
    }
  });
});

test.describe("interface language", () => {
  test("can be changed after onboarding and survives a reload", async ({ page }) => {
    await signIn(page);
    await completeOnboarding(page);

    // The language was previously only asked once, during onboarding, which left
    // a member who chose wrongly with no way back. This is the way back.
    const control = page.getByLabel(/interface language/i);
    await expect(control).toBeVisible();

    await control.selectOption("es");
    await expect(page.getByRole("navigation", { name: "Primary" })).toContainText(
      /memòria|memoria/i,
    );
    await expect(page.getByRole("link", { name: /inicio/i })).toBeVisible();

    // Stored on the account, so it follows the member to another device rather
    // than living only in this tab.
    await page.reload();
    await expect(page.getByRole("link", { name: /inicio/i })).toBeVisible();

    await page.getByLabel(/idioma de la interfaz/i).selectOption("en");
    await expect(page.getByRole("link", { name: /^home$/i })).toBeVisible();
  });
});

test.describe("Wine Memory filters", () => {
  test("stay collapsed until asked for, and report how many are active", async ({ page }) => {
    await signIn(page);
    await completeOnboarding(page);
    await page.goto("/memory");

    // Search stays open: it is the reason people come to this screen.
    await expect(page.getByLabel(/search memory/i)).toBeVisible();

    // The eleven refinements do not, because they pushed the wines themselves
    // off the first screen.
    const region = page.getByLabel(/^region$/i);
    await expect(region).toBeHidden();

    const disclosure = page
      .getByRole("group")
      .filter({ hasText: /more filters/i })
      .first();
    await page.getByText(/more filters/i).click();
    await expect(region).toBeVisible();

    // A narrowed list is never silently narrowed: the summary says so even once
    // the panel is closed again.
    await region.fill("Priorat");
    await expect(disclosure).toContainText(/1 active/i);
    await page.getByText(/more filters/i).click();
    await expect(region).toBeHidden();
    await expect(disclosure).toContainText(/1 active/i);
  });
});

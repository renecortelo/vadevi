import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * §18.3 accessibility QA. A serious or critical violation is a release blocker,
 * so this asserts on those two impact levels rather than on a score.
 *
 * These routes render without authentication. Authenticated screens are covered
 * by the component-level render tests until an emulator-backed sign-in fixture
 * exists; that gap is recorded in docs/release-review.md.
 */
const publicRoutes = ["/", "/invitations/not-a-real-token"];

test.describe("accessibility", () => {
  for (const route of publicRoutes) {
    test(`has no serious or critical axe violation on ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const blocking = results.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      );

      // Name the rules in the failure so the report is actionable.
      expect(
        blocking.map((violation) => `${violation.id} (${violation.impact}): ${violation.help}`),
      ).toEqual([]);
    });
  }

  test("exposes exactly one main landmark on a signed-out route", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // A signed-out page carries no navigation to skip past, so the skip link
    // belongs to the authenticated shell and is asserted by the render tests.
    await expect(page.locator("main#main-content")).toHaveCount(1);
  });

  test("keeps a visible focus indicator on the first interactive control", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Tab");

    const outline = await page.evaluate(() => {
      const active = document.activeElement;
      if (active === null || active === document.body) return null;
      const style = globalThis.getComputedStyle(active);
      return {
        boxShadow: style.boxShadow,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });

    expect(outline).not.toBeNull();
    // Either an outline or a focus ring drawn with box-shadow is acceptable.
    const hasIndicator =
      (outline!.outlineStyle !== "none" && outline!.outlineWidth !== "0px") ||
      outline!.boxShadow !== "none";
    expect(hasIndicator).toBe(true);
  });
});

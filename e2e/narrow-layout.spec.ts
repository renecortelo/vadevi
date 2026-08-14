import { expect, test } from "@playwright/test";

/**
 * §14.1 requires responsive layouts from 320 CSS px upward. This project runs
 * at a 320 px viewport, so a horizontal scrollbar on the document is a failure.
 */
test.describe("320 CSS px layout", () => {
  for (const route of ["/", "/invitations/not-a-real-token"]) {
    test(`has no document-level horizontal overflow on ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));

      // A one-pixel rounding tolerance keeps this from flaking on sub-pixel layout.
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  }

  test("keeps every interactive control inside the viewport", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const overflowing = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      return [...document.querySelectorAll("a, button, input, select, textarea")]
        .filter((element) => {
          const box = element.getBoundingClientRect();
          // Ignore controls that are deliberately off-screen, such as skip links.
          if (box.width === 0 && box.height === 0) return false;
          return box.right > viewportWidth + 1;
        })
        .map((element) => `${element.tagName.toLowerCase()}: ${element.textContent?.trim() ?? ""}`);
    });

    expect(overflowing).toEqual([]);
  });
});

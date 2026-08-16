import { expect, test } from "@playwright/test";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * Every text-entry field wears the palette, on every screen, in both themes.
 *
 * The appearance used to be declared per container, so a field on a screen
 * nobody had added to that list kept the browser's own — which under a dark
 * palette is a black box on a wine page. This walks the application and asks
 * the browser what it actually painted, because that is the only thing that
 * would have caught it.
 */
const routes = [
  "/",
  "/log/new",
  "/log/identify",
  "/memory",
  "/sessions",
  "/sessions/new",
  "/cellar",
  "/wishlist",
  "/shop",
  "/vicenc",
  "/spaces",
  "/spaces/new",
  "/settings/data",
];

/** Types the browser paints itself; they are checked by shape, not background. */
const nativeTypes = new Set(["checkbox", "file", "hidden", "radio"]);

test.describe("field styling", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`every field uses the palette surface in ${theme} mode`, async ({ page }) => {
      await signIn(page);
      await completeOnboarding(page);
      await page.getByLabel(/^theme$/i).selectOption(theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      const offenders: string[] = [];
      for (const route of routes) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        offenders.push(
          ...(await page.evaluate(
            ({ native, path }) => {
              const root = getComputedStyle(document.documentElement);
              const surface = root.getPropertyValue("--color-surface-raised").trim();
              // Resolve the token to the rgb() form getComputedStyle reports.
              const probe = document.createElement("span");
              probe.style.color = surface;
              document.body.append(probe);
              const expected = getComputedStyle(probe).color;
              probe.remove();

              const found: string[] = [];
              for (const element of document.querySelectorAll("input, select, textarea")) {
                const type =
                  element instanceof HTMLInputElement
                    ? element.type
                    : element.tagName.toLowerCase();
                if (native.includes(type)) continue;
                const painted = getComputedStyle(element).backgroundColor;
                if (painted !== expected) {
                  found.push(`${path} <${type}> painted ${painted}, expected ${expected}`);
                }
              }
              return found;
            },
            { native: [...nativeTypes], path: route },
          )),
        );
      }
      expect(offenders).toEqual([]);
    });
  }

  test("hands native control parts the same palette the page uses", async ({ page }) => {
    await signIn(page);
    await completeOnboarding(page);
    await page.getByLabel(/^theme$/i).selectOption("light");

    // `color-scheme` drives the date picker, the number spinners, the select
    // popup and autofill. Left at `light dark` it follows the operating system
    // instead of the account, which is how a black date field reached a cream
    // page.
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
      .toBe("light");

    await page.getByLabel(/^theme$/i).selectOption("dark");
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
      .toBe("dark");
  });
});

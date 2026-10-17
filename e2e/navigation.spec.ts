import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * The bar's five destinations, each section's pages as tabs, and a way back
 * from every page deeper than those tabs, naming where the reader came from.
 */
test("a section's tabs, and a way back that names the page left", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/memory");
  await page.locator("#interface-locale").selectOption("en");

  const bar = page.getByRole("navigation", { name: "Primary" });
  await expect(bar.getByRole("link")).toHaveText(["Home", "Log", "My wines", "Discover", "Me"]);
  await expect(bar.getByRole("link", { name: "My wines" })).toHaveAttribute("aria-current", "page");

  const tabs = page.getByRole("navigation", { name: "My wines" });
  await expect(tabs.getByRole("link")).toHaveText(["Memory", "Cellar", "Wishlist", "Prices"]);
  await tabs.getByRole("link", { name: "Cellar" }).click();
  await expect(page).toHaveURL(/\/cellar$/);
  await expect(tabs.getByRole("link", { name: "Cellar" })).toHaveAttribute("aria-current", "page");
  // A section's own pages are tabs, not a trail.
  await expect(page.locator(".back-link")).toHaveCount(0);

  // Deeper than the tabs: the way back names the page left, and goes back.
  await bar.getByRole("link", { name: "Me", exact: true }).click();
  await page.getByRole("link", { name: "Settings and more" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await page.locator(".about-list a").first().click();
  await expect(page).toHaveURL(/\/settings\/data$/);
  const back = page.locator(".back-link a");
  await expect(back).toHaveText("← About Va de Vi");
  await back.click();
  await expect(page).toHaveURL(/\/about$/);

  // Reached from outside, it leads to the section's first page.
  await page.goto("/spaces");
  await expect(page.locator(".back-link a")).toHaveText("← Cellar book");
});

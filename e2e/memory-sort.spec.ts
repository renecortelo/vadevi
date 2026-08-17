import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * Ordering the Memory table by a column.
 *
 * The list arrives in whatever order the fetch chose; the table lets a reader
 * re-order what is loaded by clicking a header, without a round trip. This logs
 * three wines whose producers are deliberately out of alphabetical order, then
 * proves the first row follows the header — ascending, then descending.
 */
async function log(page: Page, producer: string, name: string) {
  await page.goto("/log/new");
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel(/producer/i)
    .first()
    .fill(producer);
  await page
    .getByLabel(/wine name/i)
    .first()
    .fill(name);
  await page.getByRole("button", { name: /review/i }).click();
  await page.getByRole("button", { name: /^confirm/i }).click();
  await expect(page.getByRole("status").first()).toBeVisible({ timeout: 15_000 });
}

async function firstProducer(page: Page): Promise<string> {
  return (await page.locator("tbody tr").first().locator("td").first().innerText()).trim();
}

test.describe("Memory table sort", () => {
  test.describe.configure({ timeout: 180_000 });

  test("orders by the column header, both directions", async ({ page }) => {
    await signIn(page);
    await completeOnboarding(page);
    await log(page, "Zorzal", "Wine One");
    await log(page, "Alpha Celler", "Wine Two");
    await log(page, "Mistral", "Wine Three");

    await page.goto("/memory");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /^table$/i }).click();
    await expect(page.locator("table")).toBeVisible();

    const producerHeader = page.getByRole("button", { name: /producer/i });
    await producerHeader.click();
    await expect.poll(() => firstProducer(page)).toBe("Alpha Celler");
    // The active column announces its direction to assistive technology.
    await expect(page.locator('th[aria-sort="ascending"]')).toContainText(/producer/i);

    await producerHeader.click();
    await expect.poll(() => firstProducer(page)).toBe("Zorzal");
    await expect(page.locator('th[aria-sort="descending"]')).toContainText(/producer/i);
  });
});

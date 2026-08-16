import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * What the offline queue does with writes.
 *
 * The existing offline drills cover the shell: that it loads with the network
 * down, that the service worker updates, that storage pressure is announced.
 * None of them writes anything. A queue that replays is worth exactly nothing
 * if replaying it creates a second bottle, and duplicates are the failure people
 * only find weeks later, in their own data.
 */
async function quickLog(page: Page, producer: string, name: string) {
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
}

/**
 * How many wine *cards* carry this name — one card per record the server
 * returned, so a second record would be a second card. Counting elements rather
 * than text nodes matters: a name appearing twice inside one card would inflate
 * a text count and hide the thing being looked for.
 */
async function countCards(page: Page, name: string): Promise<number> {
  await page.goto("/memory");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
  return page.locator("article.wine-card", { hasText: name }).count();
}

test.describe("offline writes", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await completeOnboarding(page);
  });

  test("a wine logged offline syncs exactly once", async ({ context, page }) => {
    const name = "Vinya Offline Unica";
    // Open the screen while there is still a network, which is how this happens
    // to a person: they are in the restaurant with the form already in front of
    // them when the signal goes.
    await page.goto("/log/new");
    await page.waitForLoadState("networkidle");
    await context.setOffline(true);
    await quickLog(page, "Celler Sintètic", name);
    await page.waitForTimeout(1000);

    await context.setOffline(false);
    await page.goto("/memory");
    // Give the queue a generous window to flush and settle.
    await expect.poll(async () => countCards(page, name), { timeout: 45_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(2500);

    expect(await countCards(page, name)).toBe(1);
  });

  test("a reload while the write is still queued does not replay it twice", async ({
    context,
    page,
  }) => {
    const name = "Vinya Offline Recarregada";
    await page.goto("/log/new");
    await page.waitForLoadState("networkidle");
    // The reload has to be served by the service worker, so wait until one is
    // actually controlling the page rather than merely registered.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 20_000,
    });
    await context.setOffline(true);
    await quickLog(page, "Domaine Fictif", name);
    await page.waitForTimeout(1000);

    // The queue lives in IndexedDB, so it survives the reload. Coming back
    // online with a restored queue is the moment a second copy would appear.
    await page.reload();
    await page.waitForTimeout(500);
    await context.setOffline(false);
    await page.goto("/memory");
    await expect.poll(async () => countCards(page, name), { timeout: 45_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(2500);

    expect(await countCards(page, name)).toBe(1);
  });
});

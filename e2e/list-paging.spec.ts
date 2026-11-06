import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * A cellar longer than a page.
 *
 * The list stopped at its bound and sent the reader to an export for the rest.
 * Two hundred and fifty bottles are a lot to set up, so the two pages are
 * answered here: what is under test is the screen walking from one to the next,
 * and typing in the picker leaving the names on the cards alone.
 */
const bottle = (id: string, displayName: string) => ({
  acquiredAt: "2026-08-14T09:00:00.000Z",
  createdAt: "2026-08-14T09:00:00.000Z",
  finishedAt: null,
  giftedAt: null,
  id,
  notes: null,
  openedAt: null,
  purchaseId: null,
  removedAt: null,
  state: "owned",
  storageLocation: null,
  updatedAt: "2026-08-14T09:00:00.000Z",
  version: 1,
  wine: { displayName, producerName: "Productor Sintètic" },
  wineId: "01KP0000000000000000000003",
});
const inventory = { finished: 0, gifted: 0, opened: 0, owned: 2, removed: 0, totalAvailable: 2 };

test("a cellar longer than a page comes in a page at a time", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await completeOnboarding(page);
  await page.route(/\/api\/v1\/spaces\/[^/]+\/bottles(\?.*)?$/, async (route) => {
    const next = new URL(route.request().url()).searchParams.get("cursor") === "page-two";
    await route.fulfill({
      json: {
        data: next
          ? {
              bottles: [bottle("01KP0000000000000000000002", "Segona Ampolla")],
              hasMore: false,
              inventory,
              nextCursor: null,
            }
          : {
              bottles: [bottle("01KP0000000000000000000001", "Primera Ampolla")],
              hasMore: true,
              inventory,
              nextCursor: "page-two",
            },
      },
    });
  });
  await page.goto("/cellar");

  await expect(page.getByRole("heading", { name: "Primera Ampolla" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Segona Ampolla" })).toHaveCount(0);

  await page.getByRole("button", { name: /load more/i }).click();

  await expect(page.getByRole("heading", { name: "Segona Ampolla" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Primera Ampolla" })).toBeVisible();
  await expect(page.getByRole("button", { name: /load more/i })).toHaveCount(0);
});

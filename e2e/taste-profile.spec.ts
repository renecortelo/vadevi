import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * The taste profile as pictures: what the reader scores above and below
 * their own average as bars either side of a line, and what they drink most
 * as a ring with its shares written beside it.
 */
test("the taste profile draws above and below the average, and a ring", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("firebase:authUser:"));
    return key === undefined
      ? ""
      : (JSON.parse(localStorage.getItem(key) ?? "{}").stsTokenManager?.accessToken ?? "");
  });
  const headers = { Authorization: `Bearer ${token}` };
  const api = "http://127.0.0.1:8788/api/v1";
  const me = await page.request.get(`${api}/me/bootstrap`, { headers });
  const spaceId = (await me.json()).data.user.activeSpaceId as string;
  const wines = [
    ["Tinto Uno", "ES", "red", 92],
    ["Tinto Dos", "ES", "red", 91],
    ["Tinto Tres", "ES", "red", 93],
    ["Blanc Un", "FR", "white", 76],
    ["Blanc Deux", "FR", "white", 78],
    ["Blanc Trois", "FR", "white", 77],
  ] as const;
  for (const [index, [name, countryCode, wineType, score100]] of wines.entries()) {
    const wine = await page.request.post(`${api}/spaces/${spaceId}/wines`, {
      data: {
        countryCode,
        displayName: name,
        identityStatus: "confirmed",
        producerName: "Celler Gust",
        wineType,
      },
      headers: { ...headers, "Idempotency-Key": `W${index}`.padEnd(43, "w") },
    });
    expect(wine.ok(), await wine.text()).toBeTruthy();
    const wineId = (await wine.json()).data.wine.id as string;
    const note = await page.request.post(`${api}/spaces/${spaceId}/tasting-notes`, {
      data: {
        mode: "quick",
        score100,
        state: "submitted",
        tastedAt: new Date().toISOString(),
        wineId,
      },
      headers: { ...headers, "Idempotency-Key": `N${index}`.padEnd(43, "n") },
    });
    expect(note.ok(), await note.text()).toBeTruthy();
  }

  await page.goto("/profile");
  await page.locator("#interface-locale").selectOption("en");
  const versus = page.locator(".taste-diverging");
  await expect(versus).toBeVisible({ timeout: 15_000 });
  await expect(versus.locator(".is-above").first()).toBeAttached();
  await expect(versus.locator(".is-below").first()).toBeAttached();
  // Each chart plays as it comes into view: the bars grow, the ring fills
  // and its shares count up to what they are.
  await versus.scrollIntoViewIfNeeded();
  await expect(versus).toHaveAttribute("data-arrival", "shown");
  const ring = page.locator(".taste-donut");
  await ring.scrollIntoViewIfNeeded();
  await expect(ring).toHaveAttribute("data-arrival", "shown");
  await expect(ring.locator(".taste-donut__legend li").first()).toContainText("50%");
});

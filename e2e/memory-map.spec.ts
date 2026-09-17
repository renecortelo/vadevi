import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

test("the map view plots a tasting place and opens the wine behind it", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);

  await page.goto("/log/new");
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel(/producer/i)
    .first()
    .fill("Celler Mapa");
  await page
    .getByLabel(/wine name/i)
    .first()
    .fill("Vinya Punt");
  await page.getByRole("button", { name: /review/i }).click();
  await page.getByRole("button", { name: /^confirm/i }).click();
  await page.waitForTimeout(2000);

  await page.goto("/memory");
  await page.waitForLoadState("networkidle");
  const card = page.locator("article.wine-card", { hasText: "Vinya Punt" });
  const href = await card.locator('a[href*="/evidence"]').first().getAttribute("href");
  const wineId = href?.split("/wines/")[1]?.split("/")[0] ?? "";
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("firebase:authUser:"));
    return key === undefined
      ? ""
      : (JSON.parse(localStorage.getItem(key) ?? "{}").stsTokenManager?.accessToken ?? "");
  });
  const me = await page.request.get("http://127.0.0.1:8788/api/v1/me/bootstrap", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const spaceId = (await me.json()).data.user.activeSpaceId as string;

  // A tasting with a venue point (Barcelona), so the map has something to plot.
  const note = await page.request.post(
    `http://127.0.0.1:8788/api/v1/spaces/${spaceId}/tasting-notes`,
    {
      headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": "B".repeat(43) },
      data: {
        mode: "deep",
        wineId,
        state: "submitted",
        tastedAt: new Date().toISOString(),
        context: { venueName: "Can Pau", venueLatitude: 41.385, venueLongitude: 2.173 },
      },
    },
  );
  expect(note.ok(), await note.text()).toBeTruthy();

  await page.goto("/memory");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^mapa$|^map$/i }).click();
  const dot = page.locator("svg.points-map__canvas circle.points-map__dot").first();
  await expect(dot).toBeVisible({ timeout: 15000 });
  await dot.click();
  await expect(page.getByRole("link", { name: /Vinya Punt/i })).toBeVisible();
});

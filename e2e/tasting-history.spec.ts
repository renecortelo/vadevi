import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

test("a wine's tastings gather behind a count, openable to read", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);

  await page.goto("/log/new");
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel(/producer/i)
    .first()
    .fill("Celler Historial");
  await page
    .getByLabel(/wine name/i)
    .first()
    .fill("Vinya Registre");
  await page.getByRole("button", { name: /review/i }).click();
  await page.getByRole("button", { name: /^confirm/i }).click();
  await page.waitForTimeout(2000);

  await page.goto("/memory");
  await page.waitForLoadState("networkidle");
  // Never tasted yet: the card offers the way to start, not a count.
  await expect(
    page.getByRole("link", { name: /catar este vino|taste this wine/i }).first(),
  ).toBeVisible();

  const card = page.locator("article.wine-card", { hasText: "Vinya Registre" });
  const href = await card.locator('a[href*="/evidence"]').first().getAttribute("href");
  const wineId = href?.split("/wines/")[1]?.split("/")[0] ?? "";
  expect(wineId.length).toBeGreaterThan(0);

  // Seed a submitted quick tasting through the API, with the session token the
  // sign-in fixture stored — simpler and more reliable than driving the
  // multi-step deep-tasting form just to reach the "has tastings" state.
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("firebase:authUser:"));
    if (key === undefined) return "";
    return JSON.parse(localStorage.getItem(key) ?? "{}").stsTokenManager?.accessToken ?? "";
  });
  expect(token.length).toBeGreaterThan(0);
  const meResponse = await page.request.get("http://127.0.0.1:8788/api/v1/me/bootstrap", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const activeSpaceId = (await meResponse.json()).data.user.activeSpaceId as string;
  const created = await page.request.post(
    `http://127.0.0.1:8788/api/v1/spaces/${activeSpaceId}/tasting-notes`,
    {
      // A 43-char base64url value, which is the format the API's idempotency
      // header requires.
      headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": "A".repeat(43) },
      data: {
        mode: "quick",
        wineId,
        score100: 84,
        state: "submitted",
        tastedAt: new Date().toISOString(),
      },
    },
  );
  expect(created.ok(), await created.text()).toBeTruthy();

  // Evidence now names the count and offers to record another.
  await page.goto(`/wines/${wineId}/evidence`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/registrar otra cata|record another tasting/i)).toBeVisible({
    timeout: 15000,
  });
  // The reader's own tasting is openable to read.
  await expect(
    page.getByRole("link", { name: /leer la cata|read the tasting/i }).first(),
  ).toBeVisible();
});

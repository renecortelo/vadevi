import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * Coming back to the tab.
 *
 * Every return to the tab asks the offline layer to sync. It used to refresh
 * the device's copy of the memory each time and announce the change, and the
 * list on screen was swapped for the local copy — in another order, under the
 * «private copy» notice — though nothing had changed. Now a copy refreshed in
 * the last few minutes is left as it is, so hiding and showing the tab must
 * neither ask for the list again nor change it.
 */
test("coming back to the tab leaves the memory list as it was", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await completeOnboarding(page);

  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("firebase:authUser:"));
    return key === undefined
      ? ""
      : (JSON.parse(localStorage.getItem(key) ?? "{}").stsTokenManager?.accessToken ?? "");
  });
  const headers = { Authorization: `Bearer ${token}` };
  const me = await page.request.get("/api/v1/me/bootstrap", { headers });
  const spaceId = (await me.json()).data.user.activeSpaceId as string;
  for (const [index, name] of ["Tornada Primera", "Tornada Segona", "Tornada Tercera"].entries()) {
    const created = await page.request.post(`/api/v1/spaces/${spaceId}/wines`, {
      data: {
        displayName: name,
        identityStatus: "confirmed",
        nonVintage: false,
        producerName: "Celler de la Tornada",
        vintageYear: 2020 + index,
        wineType: "red",
      },
      headers: { ...headers, "Idempotency-Key": `${"T".repeat(42)}${index}` },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
  }

  await page.goto("/memory");
  await page.waitForLoadState("networkidle");
  const cards = page.locator("article.wine-card");
  await expect(cards.filter({ hasText: "Tornada Tercera" })).toBeVisible({ timeout: 30_000 });
  const before = await cards.allInnerTexts();

  const listRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === `/api/v1/spaces/${spaceId}/wines`) {
      listRequests.push(url.search);
    }
  });

  // What the browser does when the reader switches away and comes back.
  for (const state of ["hidden", "visible"] as const) {
    await page.evaluate((visibility) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => visibility,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  }
  await page.waitForTimeout(3_000);
  await page.waitForLoadState("networkidle");

  expect(listRequests).toEqual([]);
  expect(await cards.allInnerTexts()).toEqual(before);
  await expect(page.getByText("Showing the private copy saved on this device.")).toHaveCount(0);
});

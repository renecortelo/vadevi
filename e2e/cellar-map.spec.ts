import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * The cellar on the map: a wine whose region is a registered name puts a point
 * on the cellar book's map; touching it names it, and its page in the atlas
 * leads back to the cellar book.
 */
test("a wine from a registered name puts a point on the cellar map", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("firebase:authUser:"));
    return key === undefined
      ? ""
      : (JSON.parse(localStorage.getItem(key) ?? "{}").stsTokenManager?.accessToken ?? "");
  });
  const headers = { Authorization: `Bearer ${token}` };
  const me = await page.request.get("http://127.0.0.1:8788/api/v1/me/bootstrap", { headers });
  const spaceId = (await me.json()).data.user.activeSpaceId as string;
  const wine = await page.request.post(`http://127.0.0.1:8788/api/v1/spaces/${spaceId}/wines`, {
    data: {
      countryCode: "FR",
      displayName: "Château Mapa",
      identityStatus: "confirmed",
      producerName: "Château Mapa",
      region: "Sauternes",
    },
    headers: { ...headers, "Idempotency-Key": "M".repeat(43) },
  });
  expect(wine.ok(), await wine.text()).toBeTruthy();

  await page.goto("/stats");
  await page.locator("#interface-locale").selectOption("en");
  const point = page.getByRole("button", { name: /Sauternes: 1 wine/ });
  await expect(point).toBeAttached({ timeout: 15_000 });
  // Touching a point names it first; its page is one more touch away, and
  // leads back to the cellar book, not to the library.
  await point.click();
  const tag = page.locator(".map-tag");
  await expect(tag).toContainText("Sauternes");
  await expect(tag).toContainText("1 of your wines");
  await tag.getByRole("link", { name: "Open its page" }).click();
  await expect(page).toHaveURL(/\/library\/regions\/fr-sauternes/);
  await page.getByRole("link", { name: /Back to Cellar book/ }).click();
  await expect(page).toHaveURL(/\/stats/);
});

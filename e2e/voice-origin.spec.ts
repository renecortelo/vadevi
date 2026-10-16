import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * A tasting first recorded by voice keeps a quiet microphone in the wine's
 * history; one written by hand has none.
 */
test("a tasting recorded by voice shows its microphone in the history", async ({ page }) => {
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
  const wine = await page.request.post(`${api}/spaces/${spaceId}/wines`, {
    data: {
      displayName: "Vinya Veu",
      identityStatus: "confirmed",
      producerName: "Celler Veu",
    },
    headers: { ...headers, "Idempotency-Key": "V".repeat(43) },
  });
  const wineId = (await wine.json()).data.wine.id as string;
  for (const [creationMethod, key] of [
    ["audio", "A"],
    ["manual", "H"],
  ] as const) {
    const note = await page.request.post(`${api}/spaces/${spaceId}/tasting-notes`, {
      data: {
        creationMethod,
        mode: "deep",
        state: "submitted",
        tastedAt: new Date().toISOString(),
        wineId,
      },
      headers: { ...headers, "Idempotency-Key": key.repeat(43) },
    });
    expect(note.ok(), await note.text()).toBeTruthy();
  }

  await page.goto(`/wines/${wineId}/evidence`);
  await page.locator("#interface-locale").selectOption("en");
  const marks = page.locator(".tasting-history__list .voice-origin");
  await expect(marks).toHaveCount(1, { timeout: 15_000 });
  await expect(marks.first()).toContainText("Recorded by voice");
});

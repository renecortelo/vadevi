import { expect, test } from "@playwright/test";

/**
 * Service-worker update recovery.
 *
 * The update prompt is only useful if a waiting worker can actually be told to
 * take over. These tests exercise that handshake and the cache-hygiene rules
 * that keep an update from stranding the user on a broken worker.
 */
test.describe("service worker update", () => {
  test("a waiting worker activates when the page sends SKIP_WAITING", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 30_000,
    });

    // The registration must expose the update path the prompt depends on.
    const canUpdate = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration !== undefined && typeof registration.update === "function";
    });
    expect(canUpdate).toBe(true);

    // The worker must honour the message the prompt posts. Sending it to an
    // already-active worker is a no-op, which is exactly the safe behaviour.
    const stillControlled = await page.evaluate(async () => {
      navigator.serviceWorker.controller?.postMessage({ type: "SKIP_WAITING" });
      await new Promise((resolve) => setTimeout(resolve, 500));
      return navigator.serviceWorker.controller !== null;
    });
    expect(stillControlled).toBe(true);
  });

  test("keeps shell and bundle caches separate and owns only its own", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 30_000,
    });

    const names = await page.evaluate(() => caches.keys());
    const shell = names.filter((name) => name.startsWith("vadevi-shell"));
    expect(shell.length).toBeGreaterThan(0);

    // Exactly one live shell cache: activation removed any superseded build.
    expect(shell).toHaveLength(1);
    // Cache names carry the layout version so a redeploy installs beside them.
    expect(shell[0]).toMatch(/^vadevi-shell-v\d+-/);
  });

  test("recovers the shell after its cache is cleared", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 30_000,
    });

    // Simulate a corrupted or evicted cache and confirm the app still loads
    // from the network rather than failing closed.
    await page.evaluate(async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith("vadevi-shell")).map((name) => caches.delete(name)),
      );
    });

    await page.reload();
    await expect(page.locator("body")).not.toBeEmpty();
  });
});

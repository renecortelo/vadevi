import { expect, test } from "@playwright/test";

/**
 * AC-050: the app is installable and loads its shell offline after one
 * successful online visit.
 */
test.describe("offline shell", () => {
  test("registers a service worker and serves the shell with the network down", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    // One successful online visit is the precondition the criterion states.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 30_000,
    });

    const cachedShell = await page.evaluate(async () => {
      const match = await caches.match("/index.html");
      return match !== undefined;
    });
    expect(cachedShell).toBe(true);

    // Aborting at the route level fails every network request while still
    // dispatching the navigation through the service worker, which is exactly
    // the condition this criterion describes.
    await page.route("**/*", (route) => route.abort("internetdisconnected"));
    await page.reload();

    // The shell renders from cache rather than a browser network error page.
    await expect(page.locator("#root")).not.toBeEmpty();
    expect(await page.title()).toContain("Va de Vi");
    await page.unroute("**/*");

    // The same holds under the browser's own offline emulation.
    await context.setOffline(true);
    await page.goto("/");
    await expect(page.locator("#root")).not.toBeEmpty();
    await context.setOffline(false);
  });

  test("serves a valid installable manifest with the required icon sizes", async ({ page }) => {
    await page.goto("/");
    const href = await page.getAttribute('link[rel="manifest"]', "href");
    expect(href).toBeTruthy();

    const response = await page.request.get(href!);
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as {
      display: string;
      icons: { purpose?: string; sizes: string }[];
      name: string;
      scope: string;
      start_url: string;
    };

    expect(manifest.name.length).toBeGreaterThan(0);
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.scope).toBeTruthy();

    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((icon) => icon.purpose?.includes("maskable"))).toBe(true);
  });

  test("never serves API or runtime configuration from a cache", async ({ page, context }) => {
    await page.goto("/");
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 30_000,
    });

    // Prime the runtime-config request while online.
    await page.request.get("/runtime-config");

    await context.setOffline(true);
    const cached = await page.evaluate(async () => {
      const results = await Promise.all(
        ["/runtime-config", "/health", "/api/v1/me/bootstrap"].map(async (path) =>
          (await caches.match(path)) === undefined ? null : path,
        ),
      );
      return results.filter((entry) => entry !== null);
    });
    // Auth and runtime state must never be answerable from a cache.
    expect(cached).toEqual([]);

    await context.setOffline(false);
  });
});

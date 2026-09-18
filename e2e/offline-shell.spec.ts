import { expect, test } from "./fixtures/server";

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

  test("launches cold from the home screen with no network, on the precache alone", async ({
    browser,
  }) => {
    // The case the test above cannot reach. Its online visit through the worker
    // stores `/` afresh, so the shell it later serves offline is that copy, not
    // the precached one. A reader who installs the app, closes it, and opens it
    // on a plane never navigated through the worker at all: the precache is
    // all there is. That is the launch that came up blank.
    //
    // The cause was environmental and invisible to a plain fetch: Workers
    // Assets answers `/index.html` with a 307 to `/`, so the precached shell
    // carried the `redirected` flag, and a redirected response may not satisfy a
    // navigation. Reproduced here by making the shell redirect the same way.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route("**/index.html", (route) =>
      route.fulfill({ headers: { location: "/" }, status: 307 }),
    );

    // First visit: installs the worker and runs its precache. This navigation
    // is not yet controlled, so nothing here stores the shell the good way.
    await page.goto("/");
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 30_000,
    });
    await page.unroute("**/index.html");

    // Close the app. What is left is exactly what an installed PWA has.
    await page.close();

    // Open it again with no network at all. The shell must come from the
    // precache, and a redirected copy would fail this with a blank page.
    await context.setOffline(true);
    const relaunched = await context.newPage();
    await relaunched.goto("/");
    await expect(relaunched.locator("#root")).not.toBeEmpty({ timeout: 15_000 });
    expect(await relaunched.title()).toContain("Va de Vi");

    await context.setOffline(false);
    await context.close();
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

import { describe, expect, it } from "vitest";

import {
  bundlePrefix,
  cacheLayoutVersion,
  cacheNamesFor,
  cachePrefix,
  isNetworkOnlyRequest,
  isOwnStaleCache,
  isVersionedBundleRequest,
} from "./offline/cache-policy";

/**
 * Cache-boundary drills for AC-050. The service worker module is imported for
 * its exported policy helpers; the handlers themselves are registered against
 * the worker global and are exercised in the browser update drill recorded in
 * docs/release-review.md.
 */
describe("service worker cache boundaries", () => {
  it("never serves API, auth, or runtime configuration from a cache", () => {
    for (const path of [
      "/api/v1/me/bootstrap",
      "/api/v1/spaces/01J00000000000000000000001/wines",
      "/api/v1/spaces/01J00000000000000000000001/media/01J00000000000000000000002/content",
      "/runtime-config",
      "/health",
      "/openapi.json",
    ]) {
      expect(isNetworkOnlyRequest(new URL(`https://vadevi.test${path}`))).toBe(true);
    }
  });

  it("treats app assets and the shell as cacheable", () => {
    for (const path of ["/index.html", "/assets/app-a1b2c3.js", "/icon.svg"]) {
      expect(isNetworkOnlyRequest(new URL(`https://vadevi.test${path}`))).toBe(false);
    }
  });

  it("revalidates versioned translation and ontology bundles separately", () => {
    expect(isVersionedBundleRequest(new URL("https://vadevi.test/assets/locales-de-a1b2.js"))).toBe(
      true,
    );
    expect(
      isVersionedBundleRequest(new URL("https://vadevi.test/assets/ontology/2026.1.json")),
    ).toBe(true);
    expect(isVersionedBundleRequest(new URL("https://vadevi.test/assets/app-a1b2.js"))).toBe(false);
  });

  it("names caches so an update installs beside the previous version", () => {
    const first = cacheNamesFor(["asset-a", "asset-b"]);
    const second = cacheNamesFor(["asset-a", "asset-b", "asset-c-longer"]);

    expect(first.cacheName.startsWith(`${cachePrefix}-${cacheLayoutVersion}-`)).toBe(true);
    expect(first.bundleCacheName.startsWith(`${bundlePrefix}-${cacheLayoutVersion}-`)).toBe(true);
    // The shell and bundle caches are separate, so clearing one keeps the other.
    expect(first.cacheName).not.toBe(first.bundleCacheName);
    // A new build installs into its own cache instead of overwriting the live one.
    expect(second.cacheName).not.toBe(first.cacheName);
  });

  it("only deletes caches this application owns", () => {
    const { bundleCacheName, cacheName } = cacheNamesFor(["asset-a"]);

    expect(isOwnStaleCache(`${cachePrefix}-v1-old`, [cacheName, bundleCacheName])).toBe(true);
    expect(isOwnStaleCache(cacheName, [cacheName, bundleCacheName])).toBe(false);
    expect(isOwnStaleCache(bundleCacheName, [cacheName, bundleCacheName])).toBe(false);
    // A cache owned by another application on the same origin is never touched.
    expect(isOwnStaleCache("workbox-precache-other-app", [cacheName, bundleCacheName])).toBe(false);
  });
});

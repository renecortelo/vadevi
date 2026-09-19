/**
 * Service-worker cache policy, kept free of worker globals so the boundaries in
 * §14.2 can be asserted directly by tests as well as applied by `sw.ts`.
 */

export const cachePrefix = "vadevi-shell";
export const bundlePrefix = "vadevi-bundles";

/** Bumped whenever the cache layout changes. */
export const cacheLayoutVersion = "v2";

/**
 * Requests that must always reach the network. Serving any of these from a
 * cache could show one environment's or account's state to another.
 */
export function isNetworkOnlyRequest(url: URL): boolean {
  return (
    url.pathname.startsWith("/api/") ||
    // Firebase's sign-in handler and iframe, proxied from this origin. Auth
    // state must never be answerable from a cache; this path was, until the
    // iframe script turned up in the shell cache on a device.
    url.pathname.startsWith("/__/auth/") ||
    url.pathname === "/health" ||
    url.pathname === "/openapi.json" ||
    url.pathname === "/runtime-config"
  );
}

/**
 * Requests the worker must not answer at all — not from a cache, and not by
 * fetching on the browser's behalf either. Cloudflare Access protects the
 * administrator's screen by redirecting a navigation to its login; a service
 * worker that fetches that navigation follows the redirect and then may not
 * hand a redirected response back, which the reader sees as a blank page.
 * These are left to the browser, which handles the login round trip natively.
 */
export function isBrowserHandledRequest(url: URL): boolean {
  return url.pathname.startsWith("/cdn-cgi/") || url.pathname === "/settings/access";
}

/**
 * Locale catalogs and the tasting ontology. These are versioned, so they are
 * served stale-while-revalidate and keep the current plus previous build.
 */
export function isVersionedBundleRequest(url: URL): boolean {
  return /\/(locales|ontology)[-/]/.test(url.pathname) || /common-[\w-]+\.js$/.test(url.pathname);
}

/**
 * A short digest of the build's revisions. FNV-1a, 32 bits: nothing about it
 * needs to be secure, it needs to change when any revision does, and it has to
 * run in a worker's install step without the async crypto API.
 */
function buildDigest(revisions: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const character of revisions.join("|")) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Cache names for one build. Deriving them from the precache revisions keeps
 * two successive deployments apart, so an update installs into a fresh cache
 * and the previous one still answers until the new worker activates.
 *
 * Derived from a digest of the revisions, not their length. Vite's revisions
 * are fixed-width hashes, so the joined length was the same for every build
 * with the same number of assets — which is most builds — and each update
 * installed into the cache the live worker was serving from: the shell was
 * overwritten under it before the new worker had activated, and the previous
 * build's assets, which activation clears by cache name, were never cleared.
 */
export function cacheNamesFor(revisions: readonly string[]): {
  bundleCacheName: string;
  cacheName: string;
} {
  const buildRevision = buildDigest(revisions);
  return {
    bundleCacheName: `${bundlePrefix}-${cacheLayoutVersion}-${buildRevision}`,
    cacheName: `${cachePrefix}-${cacheLayoutVersion}-${buildRevision}`,
  };
}

/** A cache this application owns and may delete when it is superseded. */
export function isOwnStaleCache(name: string, keep: readonly string[]): boolean {
  return (name.startsWith(cachePrefix) || name.startsWith(bundlePrefix)) && !keep.includes(name);
}

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
    url.pathname === "/health" ||
    url.pathname === "/openapi.json" ||
    url.pathname === "/runtime-config"
  );
}

/**
 * Locale catalogs and the tasting ontology. These are versioned, so they are
 * served stale-while-revalidate and keep the current plus previous build.
 */
export function isVersionedBundleRequest(url: URL): boolean {
  return /\/(locales|ontology)[-/]/.test(url.pathname) || /common-[\w-]+\.js$/.test(url.pathname);
}

/**
 * Cache names for one build. Deriving them from the precache revisions keeps
 * two successive deployments apart, so an update installs into a fresh cache
 * and the previous one still answers until the new worker activates.
 */
export function cacheNamesFor(revisions: readonly string[]): {
  bundleCacheName: string;
  cacheName: string;
} {
  const buildRevision = revisions.join("|").length.toString(36);
  return {
    bundleCacheName: `${bundlePrefix}-${cacheLayoutVersion}-${buildRevision}`,
    cacheName: `${cachePrefix}-${cacheLayoutVersion}-${buildRevision}`,
  };
}

/** A cache this application owns and may delete when it is superseded. */
export function isOwnStaleCache(name: string, keep: readonly string[]): boolean {
  return (name.startsWith(cachePrefix) || name.startsWith(bundlePrefix)) && !keep.includes(name);
}

/// <reference lib="webworker" />

import {
  cacheNamesFor,
  isNetworkOnlyRequest,
  isOwnStaleCache,
  isVersionedBundleRequest,
} from "./offline/cache-policy";

/**
 * Service worker for the offline shell.
 *
 * Cache boundaries follow §14.2:
 *
 * - hashed app assets are cache-first and immutable
 * - the HTML shell is network-first with a cached fallback
 * - translation and ontology bundles are stale-while-revalidate, keeping the
 *   current and immediately previous build
 * - API, auth, and runtime configuration are never served from a cache, so one
 *   environment or account can never see another's state
 * - private media is network-only
 *
 * A failed install must not leave the app stuck on a broken worker, so the
 * install step tolerates individually unreachable assets and the activate step
 * removes only this application's stale caches.
 */

declare global {
  interface WorkerGlobalScope {
    __WB_MANIFEST: ReadonlyArray<{ revision: string | null; url: string }>;
  }
}

const serviceWorker = globalThis as unknown as ServiceWorkerGlobalScope;

// Workbox injects the build manifest at exactly one `self.__WB_MANIFEST` site.
const manifest = self.__WB_MANIFEST;

const { bundleCacheName, cacheName } = cacheNamesFor(
  manifest.map((entry) => entry.revision ?? entry.url),
);

const precacheUrls = manifest.map((entry) => entry.url);

/**
 * Precache each asset independently. One unreachable file then degrades a
 * single resource instead of failing the whole install and leaving the user on
 * a worker that can never update.
 */
async function precache(): Promise<void> {
  const cache = await caches.open(cacheName);
  await Promise.all(
    precacheUrls.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: "reload" }));
      } catch {
        // A single missing asset must not abort the install.
      }
    }),
  );
}

/** Remove this application's superseded caches, never third-party ones. */
async function removeStaleCaches(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => isOwnStaleCache(name, [cacheName, bundleCacheName]))
      .map((name) => caches.delete(name)),
  );
}

serviceWorker.addEventListener("install", (event) => {
  event.waitUntil(precache());
});

serviceWorker.addEventListener("activate", (event) => {
  event.waitUntil(removeStaleCaches().then(() => serviceWorker.clients.claim()));
});

/**
 * The update prompt asks the waiting worker to take over. Without this the user
 * would have to close every tab before a new version could activate.
 */
serviceWorker.addEventListener("message", (event) => {
  const data = event.data as { type?: string } | null;
  if (data?.type === "SKIP_WAITING") void serviceWorker.skipWaiting();
});

async function networkFirstShell(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put("/index.html", response.clone());
    }
    return response;
  } catch {
    const shell = await caches.match("/index.html");
    return shell ?? Response.error();
  }
}

async function staleWhileRevalidate(request: Request): Promise<Response> {
  const cache = await caches.open(bundleCacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached ?? Response.error());
  return cached ?? network;
}

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached !== undefined) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && request.method === "GET") {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return Response.error();
  }
}

serviceWorker.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== serviceWorker.location.origin) return;
  if (isNetworkOnlyRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
    return;
  }
  if (isVersionedBundleRequest(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

export {};

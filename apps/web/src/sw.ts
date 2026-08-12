/// <reference lib="webworker" />

declare global {
  interface WorkerGlobalScope {
    __WB_MANIFEST: ReadonlyArray<{ revision: string | null; url: string }>;
  }
}

const serviceWorker = globalThis as unknown as ServiceWorkerGlobalScope;

const cachePrefix = "vadevi-shell";
const cacheName = `${cachePrefix}-v1`;
const precacheUrls = self.__WB_MANIFEST.map((entry) => entry.url);

serviceWorker.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(precacheUrls)));
});

serviceWorker.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(cachePrefix) && name !== cacheName)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => serviceWorker.clients.claim()),
  );
});

function isPrivateOrRuntimeRequest(url: URL): boolean {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname === "/health" ||
    url.pathname === "/openapi.json" ||
    url.pathname === "/runtime-config"
  );
}

serviceWorker.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== serviceWorker.location.origin) {
    return;
  }

  if (isPrivateOrRuntimeRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const shell = await caches.match("/index.html");
        return shell ?? Response.error();
      }),
    );
    return;
  }

  event.respondWith(caches.match(request).then(async (cached) => cached ?? fetch(request)));
});

export {};

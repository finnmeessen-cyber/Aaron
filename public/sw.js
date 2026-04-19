const CACHE_NAME = "performance-tracker-v2";
const OFFLINE_FALLBACK = "/offline";
const PRECACHE_URLS = [
  OFFLINE_FALLBACK,
  "/manifest.webmanifest",
  "/icons/app-icon-192.png",
  "/icons/app-icon-512.png",
  "/icons/app-icon-maskable-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function isStaticAsset(request, requestUrl) {
  if (!isSameOrigin(requestUrl)) {
    return false;
  }

  if (requestUrl.pathname.startsWith("/api/")) {
    return false;
  }

  if (requestUrl.pathname.startsWith("/_next/image")) {
    return false;
  }

  if (requestUrl.pathname.startsWith("/_next/static/")) {
    return true;
  }

  return ["style", "script", "image", "font", "manifest"].includes(request.destination);
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        return caches.match(OFFLINE_FALLBACK);
      })
    );
    return;
  }

  if (!isStaticAsset(event.request, requestUrl)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkResponse = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
          }
          return response;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkResponse;
    })
  );
});

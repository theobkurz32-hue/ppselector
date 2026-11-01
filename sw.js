const CACHE_PREFIX =
  "riviera-" +
  encodeURIComponent(new URL(self.registration.scope).pathname) +
  "-";
const CACHE = CACHE_PREFIX + "v8-management";
const LEGACY = [
  "riviera-v2",
  "riviera-v3-mobile",
  "riviera-v4-monochrome",
  "riviera-v5-phase-groups",
  "riviera-v6-explicit-fold",
  "riviera-v7-shared-ready",
  "riviera-v8-management",
];
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=8",
  "./domain.js?v=8",
  "./app.js?v=8",
  "./shared.js?v=8",
  "./data/project.json",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith(CACHE_PREFIX) || LEGACY.includes(key)) &&
                key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  if (new URL(event.request.url).pathname.includes("/api/")) return;
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (
          response.ok &&
          ASSETS.some(
            (path) =>
              new URL(path, self.location.href).href === event.request.url,
          )
        ) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then((cache) => cache.put(event.request, copy)),
          );
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});

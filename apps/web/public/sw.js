const STATIC_CACHE = "gp-static-v1";
const API_CACHE = "gp-api-v1";
const DASHBOARD_KEY = "/dashboard-today";
const APP_SHELL = "/index.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll([
        "/",
        APP_SHELL,
        "/manifest.webmanifest",
        "/icons/icon-192.svg",
        "/icons/icon-512.svg"
      ])
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(APP_SHELL).then((cached) => cached || caches.match("/"))
      )
    );
    return;
  }

  if (url.pathname.includes("rpc/dashboard_collect_today")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(API_CACHE).then((cache) => cache.put(DASHBOARD_KEY, copy));
          return response;
        })
        .catch(() => caches.open(API_CACHE).then((cache) => cache.match(DASHBOARD_KEY)))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

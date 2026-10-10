const VERSION = "amd-v3.0.0-local-life-os";
const APP_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const APP_SHELL = ["/", "/map/", "/saved/", "/recent/", "/settings/", "/parking/", "/manifest.webmanifest", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  if ("navigationPreload" in self.registration) event.waitUntil(self.registration.navigationPreload.enable().catch(() => undefined));
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => ![APP_CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match("/offline.html"));
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  if (cached) {
    void refresh;
    return cached;
  }
  return (await refresh) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Maps/Places assets are intentionally outside the PWA caches. Their own
  // provider caching and the app's explicit API safety policy remain authoritative.
  if (url.hostname.includes("googleapis.com") || url.hostname.includes("gstatic.com") || url.hostname.includes("google.com/maps")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json?.() || {};
  } catch {
    payload = { body: event.data?.text?.() || "" };
  }
  const title = payload.title || "Around My Dorm";
  const options = {
    body: payload.body || "มีอัปเดตใหม่รอบหอ",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    data: {
      url: payload.url || "/",
      ...(payload.data || {}),
    },
    tag: payload.tag || "around-my-dorm-update",
    renotify: Boolean(payload.renotify),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const sameOrigin = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (sameOrigin) {
        sameOrigin.navigate?.(target);
        return sameOrigin.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});

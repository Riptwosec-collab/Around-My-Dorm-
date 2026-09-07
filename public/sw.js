const VERSION = "amd-v2.2.0";
const APP_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const APP_SHELL = ["/", "/saved/", "/recent/", "/settings/", "/parking/", "/manifest.webmanifest", "/offline.html"];
self.addEventListener("install", (event) => { event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => ![APP_CACHE,RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (event) => {
  const request = event.request; if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.hostname.includes("googleapis.com") || url.hostname.includes("gstatic.com") || url.hostname.includes("google.com/maps")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => { const clone=response.clone(); caches.open(RUNTIME_CACHE).then((cache)=>cache.put(request,clone)); return response; }).catch(async () => (await caches.match(request)) || (await caches.match("/offline.html"))));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => { if (response.ok) { const clone=response.clone(); caches.open(RUNTIME_CACHE).then((cache)=>cache.put(request,clone)); } return response; })));
  }
});

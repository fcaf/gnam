// GNAM · service worker: rende l'app installabile e veloce da riaprire.
// I dati delle ricette arrivano sempre freschi da Supabase (non vengono messi in cache).
const VERSIONE = "gnam-v1";
const GUSCIO = [
  "./", "index.html", "css/app.css", "js/app.js", "js/dati.js", "js/util.js", "js/config.js",
  "js/ricette-iniziali.js", "img/logo.svg", "img/icona-192.png", "img/icona-512.png", "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSIONE).then((c) => c.addAll(GUSCIO)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== VERSIONE).map((n) => caches.delete(n)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // Supabase, font e CDN: rete diretta
  // Prima la rete (così gli aggiornamenti arrivano subito), poi la copia salvata se sei offline
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(VERSIONE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});

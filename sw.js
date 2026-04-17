// ═══════════════════════════════════════════════
//  AgroTIC — Service Worker
//  Mouhamadou Moustapha SY
//  Version 2.0
// ═══════════════════════════════════════════════

const CACHE_NAME = "agrotic-v2";
const ASSETS = [
  "./",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400;1,600&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
];

// ── INSTALL : mise en cache de toutes les ressources ──
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[AgroTIC SW] Mise en cache des ressources...");
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE : nettoyage des anciens caches ──
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[AgroTIC SW] Suppression ancien cache :", key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH : stratégie Cache First puis réseau ──
self.addEventListener("fetch", (event) => {
  // Ne pas intercepter les requêtes non-GET
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Ressource en cache : servir immédiatement + mettre à jour en arrière-plan
        const fetchPromise = fetch(event.request)
          .then((networkResp) => {
            if (networkResp && networkResp.status === 200) {
              const clone = networkResp.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkResp;
          })
          .catch(() => cached);
        return cached;
      }

      // Pas en cache : aller chercher sur le réseau
      return fetch(event.request)
        .then((networkResp) => {
          if (!networkResp || networkResp.status !== 200 || networkResp.type === "opaque") {
            return networkResp;
          }
          const clone = networkResp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return networkResp;
        })
        .catch(() => {
          // Hors-ligne et pas en cache : page de fallback
          if (event.request.destination === "document") {
            return caches.match("/index.html");
          }
        });
    })
  );
});

// ── MESSAGE : forcer la mise à jour ──
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

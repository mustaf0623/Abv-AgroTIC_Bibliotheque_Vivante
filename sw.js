/* ══════════════════════════════════════════════════
   AgroTIC — Service Worker v4.0
   Compatible GitHub Pages + Netlify
   ══════════════════════════════════════════════════ */

const CACHE_NAME = 'agrotic-v4';

// Détecter le base path automatiquement (GitHub Pages ou Netlify)
const BASE = self.location.pathname.replace(/\/sw\.js$/, '');

const ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/icon-192.png',
];

// ── INSTALLATION : mise en cache avec le bon base path ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Mettre en cache chaque asset individuellement pour éviter l'échec en bloc
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(e => console.warn('[SW] Could not cache:', url, e)))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATION : supprimer les anciens caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH : cache-first → network → fallback offline ──
self.addEventListener('fetch', event => {
  // Ne pas intercepter les requêtes non-GET ni les API externes
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/.netlify/functions/')) return;
  if (event.request.url.includes('googleapis.com')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Pas en cache → réseau
      return fetch(event.request)
        .then(response => {
          // Mettre en cache les réponses valides
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Hors ligne et pas en cache → retourner index.html pour navigation
          if (event.request.mode === 'navigate') {
            return caches.match(BASE + '/index.html')
              .then(r => r || caches.match(BASE + '/'));
          }
        });
    })
  );
});

// ── PUSH : notification venant du serveur ──
// Déclenché même quand l'app est totalement fermée/killée
self.addEventListener('push', event => {
  let data = {
    title: '🌱 AgroTIC — Nouvelle notion disponible',
    body: "Une nouvelle notion t'attend. Ouvre l'app pour la découvrir !",
    icon: BASE + '/icon-192.png',
    badge: BASE + '/icon-192.png',
    tag: 'agrotic-push',
    url: BASE + '/'
  };
  if (event.data) {
    try { data = { ...data, ...JSON.parse(event.data.text()) }; }
    catch(e) { data.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      renotify: true,
      vibrate: [200, 100, 200],
      requireInteraction: false,
      data: { url: data.url }
    })
  );
});

// ── NOTIFICATION CLICK : ouvrir l'app ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || (BASE + '/');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

// ── MESSAGE depuis l'app (notifications locales + badge) ──
self.addEventListener('message', event => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'SHOW_NOTIFICATION') {
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: BASE + '/icon-192.png',
        badge: BASE + '/icon-192.png',
        tag: 'agrotic-notif',
        renotify: true,
        vibrate: [200, 100, 200],
        data: { url: BASE + '/' }
      })
    );
  }
  if (data.type === 'SET_BADGE') {
    if ('setAppBadge' in self.navigator) {
      self.navigator.setAppBadge(data.count).catch(() => {});
    }
  }
  if (data.type === 'CLEAR_BADGE') {
    if ('clearAppBadge' in self.navigator) {
      self.navigator.clearAppBadge().catch(() => {});
    }
  }
});

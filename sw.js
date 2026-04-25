/* ══════════════════════════════════════════════════
   AgroTIC — Service Worker v2.0
   Gère : cache offline + notifications + badge
   ══════════════════════════════════════════════════ */

const CACHE_NAME = 'agrotic-v2';
const ASSETS = ['/', '/index.html', '/icon-192.png', '/icon-512.png'];

// ── INSTALLATION : mise en cache des assets ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(() => {
        // Si certains assets manquent (ex: icon-512.png), on continue quand même
        return cache.addAll(['/', '/index.html']);
      });
    })
  );
  self.skipWaiting();
});

// ── ACTIVATION : nettoyage des anciens caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH : stratégie cache-first pour offline ──
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).catch(() => {
        // Si offline et pas en cache, retourner index.html
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ── NOTIFICATION CLICK : ouvrir l'app au clic ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Si l'app est déjà ouverte, la mettre au premier plan
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      // Sinon ouvrir une nouvelle fenêtre
      return self.clients.openWindow('/');
    })
  );
});

// ── MESSAGE : afficher une notification depuis l'app ──
// L'app envoie un message au SW pour déclencher une notification
self.addEventListener('message', event => {
  const data = event.data;

  if (data && data.type === 'SHOW_NOTIFICATION') {
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'agrotic-notif',
        renotify: true,
        requireInteraction: false,
        vibrate: [200, 100, 200],
        data: { url: '/' }
      })
    );
  }

  if (data && data.type === 'SET_BADGE') {
    if ('setAppBadge' in self.navigator) {
      self.navigator.setAppBadge(data.count).catch(() => {});
    }
  }

  if (data && data.type === 'CLEAR_BADGE') {
    if ('clearAppBadge' in self.navigator) {
      self.navigator.clearAppBadge().catch(() => {});
    }
  }
});

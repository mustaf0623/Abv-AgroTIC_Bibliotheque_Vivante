/* ══════════════════════════════════════════════════
   AgroTIC — Service Worker v5.0
   Notifications via Ntfy.sh (zéro token, zéro serveur)
   ══════════════════════════════════════════════════ */

const CACHE_NAME  = 'agrotic-v5';
const NTFY_TOPIC  = 'agrotic-bibliotheque-vivante-mustaf0623';
const BASE        = self.location.pathname.replace(/\/sw\.js$/, '');
const ASSETS      = [BASE + '/', BASE + '/index.html', BASE + '/icon-192.png'];

// ── INSTALLATION ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(ASSETS.map(url => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

// ── ACTIVATION ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => {
        self.clients.claim();
        // Démarrer l'écoute Ntfy dès l'activation
        startNtfyListener();
      })
  );
});

// ── FETCH : cache-first → network → fallback offline ──
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('ntfy.sh')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(response => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match(BASE + '/index.html').then(r => r || caches.match(BASE + '/'));
          }
        });
    })
  );
});

// ── NTFY LISTENER : écoute le canal SSE Ntfy ──
// Fonctionne même quand l'app est en arrière-plan
let ntfyController = null;

function startNtfyListener() {
  if (ntfyController) return; // Déjà en écoute

  const url = 'https://ntfy.sh/' + NTFY_TOPIC + '/sse';

  function connect() {
    // Utiliser fetch avec ReadableStream pour SSE dans le SW
    fetch(url).then(response => {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function read() {
        reader.read().then(({ done, value }) => {
          if (done) {
            // Reconnexion automatique après 5 secondes
            setTimeout(connect, 5000);
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.event === 'message') {
                  // Afficher la notification
                  self.registration.showNotification(
                    data.title || '🌱 AgroTIC',
                    {
                      body: data.message || "Une nouvelle notion t'attend !",
                      icon: BASE + '/icon-192.png',
                      badge: BASE + '/icon-192.png',
                      tag: 'agrotic-ntfy',
                      renotify: true,
                      vibrate: [200, 100, 200],
                      data: { url: BASE + '/' }
                    }
                  );
                }
              } catch(e) {}
            }
          }
          read();
        }).catch(() => setTimeout(connect, 5000));
      }
      read();
    }).catch(() => setTimeout(connect, 5000));
  }

  connect();
}

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || BASE + '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

// ── MESSAGE depuis l'app ──
self.addEventListener('message', event => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'NTFY_SUBSCRIBE') startNtfyListener();

  if (data.type === 'SET_BADGE') {
    if ('setAppBadge' in self.navigator) self.navigator.setAppBadge(data.count).catch(() => {});
  }
  if (data.type === 'CLEAR_BADGE') {
    if ('clearAppBadge' in self.navigator) self.navigator.clearAppBadge().catch(() => {});
  }
});

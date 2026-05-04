/* ══════════════════════════════════════════════════
   AgroTIC — Service Worker v5.0
   Notifications via Ntfy.sh (zéro token, zéro serveur)
   ══════════════════════════════════════════════════ */

const CACHE_NAME  = '/Abv-AgroTIC_Bibliotheque_Vivante/index.html';
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
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== SW_KV).map(k => caches.delete(k))
      ))
      .then(() => {
        self.clients.claim();
        // Démarrer l'écoute Ntfy dès l'activation
        startNtfyListener();
        // Démarrer le background timer
        startBackgroundTimer();
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
                  // Si un client est visible → popup HTML, sinon → notification OS
                  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
                    const visibleClient = clients.find(c => c.visibilityState === 'visible');
                    if (visibleClient) {
                      visibleClient.postMessage({ type: 'TIMER_FIRED' });
                    } else {
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
                  });
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

// ── TIMER DE FOND (même si l'app est fermée) ──
let nextNotifTime = null;
let intervalMin = 45; // Par défaut 45 minutes

// Persistance légère via Cache API — survit aux cycles de veille du SW
const SW_KV = 'agrotic-sw-kv';
async function swSet(key, value) {
  try { const c = await caches.open(SW_KV); await c.put('/__kv__/'+key, new Response(String(value))); } catch(e) {}
}
async function swGet(key) {
  try { const c = await caches.open(SW_KV); const r = await c.match('/__kv__/'+key); if(r) return await r.text(); } catch(e) {}
  return null;
}
async function loadTimerState() {
  const i = await swGet('intervalMin');
  const n = await swGet('nextNotifTime');
  if (i) intervalMin   = parseInt(i);
  if (n) nextNotifTime = parseInt(n);
}

function startBackgroundTimer() {
  console.log('[AgroTIC] Background timer init');
  // Vérifier immédiatement au démarrage (au cas où timer déjà écoulé)
  loadTimerState().then(() => checkBackgroundTimer());
  // Note : periodicSync est enregistré côté PAGE (index.html) avec le bon intervalle utilisateur
  // Le SW se contente d'écouter l'événement periodicsync ci-dessous
}

function checkBackgroundTimer() {
  try {
    if (!nextNotifTime) return;

    const now = Date.now();

    if (now >= nextNotifTime) {
      // Reprogrammer immédiatement avant tout
      nextNotifTime = now + intervalMin * 60 * 1000;
      swSet('nextNotifTime', nextNotifTime);

      // Vérifier si un client (onglet) est déjà visible
      // Si oui : lui demander de déclencher le popup — pas de doublon OS
      // Si non : envoyer la notification OS
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        const visibleClient = clients.find(c => c.visibilityState === 'visible');

        if (visibleClient) {
          // App visible → on demande à la page de déclencher le popup
          visibleClient.postMessage({ type: 'TIMER_FIRED' });
        } else {
          // App en arrière-plan ou fermée → notification OS
          self.registration.showNotification('🌱 AgroTIC — Nouvelle notion', {
            body: "Une nouvelle notion t'attend. Ouvre l'app pour la découvrir !",
            icon: BASE + '/icon-192.png',
            badge: BASE + '/icon-192.png',
            tag: 'agrotic-bg-timer',
            renotify: true,
            vibrate: [200, 100, 200],
            data: { url: BASE + '/' }
          });
        }
      });
    }
  } catch(e) {
    console.error('[AgroTIC] Background timer error:', e);
  }
}

// ── PERIODIC BACKGROUND SYNC — réveille le SW périodiquement par l'OS ──
// Fonctionne sur Android Chrome quand l'app est installée (PWA) et que l'utilisateur
// a accordé les permissions de notifications
self.addEventListener('periodicsync', event => {
  if (event.tag === 'agrotic-timer') {
    event.waitUntil(
      loadTimerState().then(() => checkBackgroundTimer())
    );
  }
});

// ── MESSAGE depuis l'app ──
self.addEventListener('message', event => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'NTFY_SUBSCRIBE') startNtfyListener();

  if (data.type === 'SHOW_NOTIF_NOW') {
    // La page a détecté que le timer est écoulé pendant qu'elle était en arrière-plan
    // Elle nous demande d'envoyer la notification OS immédiatement
    self.registration.showNotification(data.title || '🌱 AgroTIC — Nouvelle notion', {
      body: data.body || "Une nouvelle notion t'attend. Ouvre l'app pour la découvrir !",
      icon: BASE + '/icon-192.png',
      badge: BASE + '/icon-192.png',
      tag: 'agrotic-bg-timer',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: BASE + '/' }
    });
    // Reprogrammer le prochain déclenchement
    nextNotifTime = Date.now() + intervalMin * 60 * 1000;
    swSet('nextNotifTime', nextNotifTime);
  }
  
  if (data.type === 'SYNC_TIMER_DATA') {
    // L'app envoie l'intervalle et la prochaine heure de notification
    if (data.interval) {
      intervalMin = data.interval;
      swSet('intervalMin', intervalMin); // persister le choix utilisateur
    }
    if (data.nextNotifTime) {
      nextNotifTime = data.nextNotifTime;
      swSet('nextNotifTime', nextNotifTime); // persister le prochain déclenchement
      console.log('[AgroTIC] Timer synchronisé: ' + new Date(nextNotifTime).toLocaleString() + ' (intervalle: ' + intervalMin + ' min)');
    }
    startBackgroundTimer();
  }

  if (data.type === 'SET_BADGE') {
    if ('setAppBadge' in self.navigator) self.navigator.setAppBadge(data.count).catch(() => {});
  }
  if (data.type === 'CLEAR_BADGE') {
    if ('clearAppBadge' in self.navigator) self.navigator.clearAppBadge().catch(() => {});
  }
});

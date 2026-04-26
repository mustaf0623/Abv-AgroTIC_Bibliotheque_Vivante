// .github/scripts/send-push.js
// Exécuté par GitHub Actions toutes les 45 minutes
// Envoie une notification push à tous les abonnés

const webpush = require('web-push');

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL   = process.env.VAPID_EMAIL || 'mailto:agrotic@ussein.sn';

// Les subscriptions sont stockées dans un GitHub Secret (JSON array)
const SUBSCRIPTIONS_JSON = process.env.SUBSCRIPTIONS_JSON || '[]';

async function main() {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.error('[AgroTIC] VAPID keys missing. Add them to GitHub Secrets.');
    process.exit(1);
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

  let subscriptions = [];
  try {
    subscriptions = JSON.parse(SUBSCRIPTIONS_JSON);
  } catch(e) {
    console.log('[AgroTIC] No subscriptions found or invalid JSON.');
    process.exit(0);
  }

  if (!subscriptions.length) {
    console.log('[AgroTIC] No subscribers. Nothing to send.');
    process.exit(0);
  }

  const payload = JSON.stringify({
    title: '🌱 AgroTIC — Nouvelle notion disponible',
    body: "Une nouvelle notion t'attend. Ouvre l'app pour la découvrir et gagner des XP !",
    icon: '/Abv-AgroTIC_Bibliotheque_Vivante/icon-192.png',
    badge: '/Abv-AgroTIC_Bibliotheque_Vivante/icon-192.png',
    tag: 'agrotic-scheduled',
    url: '/Abv-AgroTIC_Bibliotheque_Vivante/'
  });

  let sent = 0, failed = 0, expired = 0;
  const validSubs = [];

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
      sent++;
      validSubs.push(sub); // Garder les abonnements valides
    } catch(err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log('[AgroTIC] Expired subscription removed:', sub.endpoint.slice(0, 50) + '...');
        expired++;
        // Ne pas ajouter aux validSubs → supprimé automatiquement
      } else {
        console.error('[AgroTIC] Push error:', err.message);
        failed++;
        validSubs.push(sub); // Garder en cas d'erreur temporaire
      }
    }
  }

  console.log(`[AgroTIC] Résultat: ${sent} envoyés, ${failed} erreurs, ${expired} expirés`);

  // Si des abonnements ont expiré, afficher les nouvelles subscriptions à mettre dans le Secret
  if (expired > 0) {
    console.log('[AgroTIC] Mets à jour le secret PUSH_SUBSCRIPTIONS avec:');
    console.log(JSON.stringify(validSubs));
  }
}

main().catch(err => {
  console.error('[AgroTIC] Fatal error:', err);
  process.exit(1);
});
// Demande la souscription et l'affiche dans un champ texte sur la page
navigator.serviceWorker.ready.then(r => {
  r.pushManager.getSubscription().then(s => {
    if (s) {
      // Crée une zone de texte avec le JSON pour pouvoir le copier depuis le téléphone
      const textArea = document.createElement('textarea');
      textArea.style.width = '100%';
      textArea.style.height = '150px';
      textArea.value = JSON.stringify(s.toJSON());
      document.body.appendChild(textArea);
    } else {
      alert("Aucune souscription générée sur ce téléphone.");
    }
  });
});

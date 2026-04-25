// .github/scripts/send-push.js
const webpush = require('./node_modules/web-push');

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL   = process.env.VAPID_EMAIL || 'mailto:agrotic@ussein.sn';
const SUBSCRIPTIONS_JSON = process.env.SUBSCRIPTIONS_JSON || '[]';

async function main() {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.error('[AgroTIC] VAPID keys manquantes. Vérifie les GitHub Secrets.');
    process.exit(1);
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

  let subscriptions = [];
  try {
    subscriptions = JSON.parse(SUBSCRIPTIONS_JSON);
  } catch(e) {
    console.log('[AgroTIC] PUSH_SUBSCRIPTIONS invalide ou vide.');
    process.exit(0);
  }

  if (!subscriptions.length) {
    console.log('[AgroTIC] Aucun abonné pour le moment. Pipeline OK.');
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
      validSubs.push(sub);
      console.log('[AgroTIC] ✅ Envoyé à:', sub.endpoint.slice(0, 60) + '...');
    } catch(err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log('[AgroTIC] 🗑️ Abonnement expiré supprimé.');
        expired++;
      } else {
        console.error('[AgroTIC] ❌ Erreur:', err.message);
        failed++;
        validSubs.push(sub);
      }
    }
  }

  console.log(`\n[AgroTIC] Résultat: ${sent} envoyés ✅ | ${failed} erreurs ❌ | ${expired} expirés 🗑️`);

  if (expired > 0) {
    console.log('\n[AgroTIC] Mets à jour le secret PUSH_SUBSCRIPTIONS avec:');
    console.log(JSON.stringify(validSubs));
  }
}

main().catch(err => {
  console.error('[AgroTIC] Erreur fatale:', err);
  process.exit(1);
});

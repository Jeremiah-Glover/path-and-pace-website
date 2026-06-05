// ── Service worker — installable PWA + offline shell ──────────────────────────
// Bump CACHE when shipping new assets so clients refresh the cached shell.
const CACHE = 'hb-portal-v3';
const SHELL = [
  'dashboard.html',
  'index.html',
  'chief.png',
  'css/portal.css',
  'js/firebase.js', 'js/util.js', 'js/store.js', 'js/nda.js', 'js/themes.js', 'js/voice.js', 'js/push.js',
  'js/overview.js', 'js/projects.js', 'js/chief-chat.js',
  'js/calendar.js', 'js/burrow.js', 'js/vault.js', 'js/account.js', 'js/app.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache Firebase / Google / Cloud Functions traffic — always go live.
  if (url.origin !== self.location.origin) return;

  // HTML: network-first (fresh app), fall back to cached shell offline.
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(fetch(req).catch(() => caches.match('dashboard.html')));
    return;
  }
  // Static same-origin assets: cache-first, then network (and cache it).
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => hit))
  );
});

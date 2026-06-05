// ── FCM background messaging service worker ───────────────────────────────────
// Handles Chief's push notifications when the portal tab is closed/backgrounded.
// Uses the compat SDK (the modular SDK isn't usable inside a classic worker).
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyCOAKaCwGGJbq3r0CmdPk7_tn72IkCyBvc",
  authDomain:        "honeybadger---the-chief.firebaseapp.com",
  projectId:         "honeybadger---the-chief",
  storageBucket:     "honeybadger---the-chief.firebasestorage.app",
  messagingSenderId: "991065444459",
  appId:             "1:991065444459:web:6fce11f59691d60f1a612e",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || 'Chief', {
    body: n.body || '',
    icon: 'chief.png',
    badge: 'chief.png',
    data: { link: payload.fcmOptions?.link || 'dashboard.html' },
  });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = e.notification.data?.link || 'dashboard.html';
  e.waitUntil(clients.matchAll({ type: 'window' }).then(wins => {
    for (const w of wins) { if (w.url.includes('honeybadger') && 'focus' in w) return w.focus(); }
    return clients.openWindow(link);
  }));
});

// ── Web push (FCM) ────────────────────────────────────────────────────────────
// Requests notification permission, gets an FCM web token, and registers it with
// the backend (registerPushToken, platform:'web') so Chief's proactive nudges can
// reach the browser. Foreground messages surface as a toast.
import { app, functions, httpsCallable, VAPID_KEY,
         getMessaging, getToken, onMessage, messagingSupported } from './firebase.js';
import { toast } from './util.js';

let messaging = null;
let foregroundWired = false;

export async function pushSupported() {
  try { return ('Notification' in window) && (await messagingSupported()); }
  catch { return false; }
}

export function pushState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;   // 'granted' | 'denied' | 'default'
}

// Ask permission, register the FCM SW, fetch the token, store it on the user.
export async function enablePush() {
  if (!(await pushSupported())) { toast('Notifications are not supported in this browser', 'err'); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Notifications blocked — enable them in your browser settings', 'err'); return false; }

  const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js');
  messaging = messaging || getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (!token) { toast("Couldn't get a push token — try again", 'err'); return false; }

  await httpsCallable(functions, 'registerPushToken')({ token, platform: 'web' });
  wireForeground();
  toast('Notifications on — Chief can reach you here');
  return true;
}

function wireForeground() {
  if (foregroundWired || !messaging) return;
  foregroundWired = true;
  onMessage(messaging, payload => {
    const n = payload.notification || {};
    toast(`${n.title || 'Chief'} — ${n.body || ''}`);
  });
}

// On boot: if already granted, refresh the token silently so it stays current.
export async function refreshPushToken() {
  try {
    if (pushState() !== 'granted' || !(await pushSupported())) return;
    const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js');
    messaging = messaging || getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (token) { await httpsCallable(functions, 'registerPushToken')({ token, platform: 'web' }); wireForeground(); }
  } catch (_) { /* non-fatal */ }
}

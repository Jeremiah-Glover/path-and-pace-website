// ── Firebase bootstrap ────────────────────────────────────────────────────────
// Single source of truth for the Firebase app + auth + db. Every module imports
// from here so we only ever initialize once. Re-exports the SDK helpers the rest
// of the portal needs so feature modules don't each pull from the CDN.
import { initializeApp }   from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
import { getAnalytics }    from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-analytics.js';
import {
  getAuth, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, onSnapshot, serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-functions.js';
import { getMessaging, getToken, onMessage, isSupported as messagingSupported } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging.js';

const firebaseConfig = {
  apiKey:            "AIzaSyCOAKaCwGGJbq3r0CmdPk7_tn72IkCyBvc",
  authDomain:        "honeybadger---the-chief.firebaseapp.com",
  projectId:         "honeybadger---the-chief",
  storageBucket:     "honeybadger---the-chief.firebasestorage.app",
  messagingSenderId: "991065444459",
  appId:             "1:991065444459:web:6fce11f59691d60f1a612e",
  measurementId:     "G-7HGQ02434F"
};

export const app  = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch (_) { /* analytics optional */ }
export const auth = getAuth(app);
export const db   = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');

// Cloud Functions base (matches AppConfig.functionsBaseURL on iOS).
export const FUNCTIONS_BASE =
  "https://us-central1-honeybadger---the-chief.cloudfunctions.net";

// Web push (FCM) — VAPID public key from Firebase Console → Cloud Messaging.
export const VAPID_KEY =
  "BGsufg6iFSxMS-22b3qcth-fCL0JAYfmWDhJL6MmvA8C8iSQfe3Ep4JrMV8qypyOZn952MdB1FvjE5tBpK7OZhA";
export const firebaseConfig_ = firebaseConfig;

export {
  onAuthStateChanged, signOut,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, onSnapshot, serverTimestamp, writeBatch,
  httpsCallable, getMessaging, getToken, onMessage, messagingSupported
};

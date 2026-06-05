// ── Chief's voice on the web ──────────────────────────────────────────────────
// Speaks Chief's replies. Primary path is the same Piper voice the phone uses
// (synthesizeSpeech Cloud Function); if that's unavailable (not deployed yet,
// offline, etc.) it falls back to the browser's built-in speech so the toggle
// always does something.
import { auth, FUNCTIONS_BASE } from './firebase.js';

const SYNTH_URL = `${FUNCTIONS_BASE}/synthesizeSpeech`;
const KEY = 'hb.voiceOn';
let audio = null;

export function voiceOn() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }
export function setVoiceOn(on) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) {} if (!on) stop(); }

export function stop() {
  if (audio) { audio.pause(); audio = null; }
  try { window.speechSynthesis?.cancel(); } catch (_) {}
}

// Default to the phone's default Piper voice ("amy"); a synced voice choice can
// override this later.
export async function speak(text, voiceId = 'amy') {
  if (!text?.trim()) return;
  stop();
  try {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch(SYNTH_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 1000), voice: voiceId }),
    });
    if (!res.ok) throw new Error('synth ' + res.status);
    const buf = await res.arrayBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
  } catch (_) {
    browserSpeak(text);   // graceful fallback
  }
}

function browserSpeak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.04; u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  } catch (_) {}
}

// ── Themes — shared across the HoneyBadger ecosystem ──────────────────────────
// These presets mirror AppTheme.presets in the iOS app exactly. Picking one on
// the web writes settings/app.theme, which the phone reads on next sync — and the
// phone's choice flows back the same way. The portal recolors itself live by
// mapping the theme onto its CSS custom properties.
import { updateSettings, store } from './store.js';

export const THEMES = [
  { id: 'night-ops', name: 'Night Ops', bgHex: '#04080a', tabBGHex: '#111a1c', accentHex: '#bf4b17', secondaryHex: '#2a6b78', textHex: '#f0ede8', isDark: true },
  { id: 'slate',     name: 'Slate',     bgHex: '#28333b', tabBGHex: '#313e47', accentHex: '#e0843c', secondaryHex: '#6fa6b3', textHex: '#eef2f4', isDark: true },
  { id: 'dusk',      name: 'Dusk',      bgHex: '#2c2738', tabBGHex: '#363046', accentHex: '#b487d6', secondaryHex: '#6b8ca0', textHex: '#ece8f2', isDark: true },
  { id: 'harbor',    name: 'Harbor',    bgHex: '#1f3438', tabBGHex: '#284247', accentHex: '#d98a4a', secondaryHex: '#5fa0a8', textHex: '#e8f0f0', isDark: true },
  { id: 'amethyst',  name: 'Amethyst',  bgHex: '#0d0814', tabBGHex: '#150f20', accentHex: '#8b4fcf', secondaryHex: '#2a8b9f', textHex: '#ede8f5', isDark: true },
  { id: 'noir',      name: 'Noir',      bgHex: '#080806', tabBGHex: '#12100e', accentHex: '#c9922a', secondaryHex: '#8c7535', textHex: '#f5f0e8', isDark: true },
  { id: 'sage',      name: 'Sage',      bgHex: '#d7ddd0', tabBGHex: '#ccd4c3', accentHex: '#6f8a45', secondaryHex: '#3f7068', textHex: '#272c22', isDark: false },
  { id: 'clay',      name: 'Clay',      bgHex: '#e2d4c6', tabBGHex: '#d6c6b6', accentHex: '#b0532c', secondaryHex: '#796a54', textHex: '#2d251e', isDark: false },
  { id: 'fog',       name: 'Fog',       bgHex: '#dadee1', tabBGHex: '#ced3d7', accentHex: '#4a6b85', secondaryHex: '#6f7d86', textHex: '#262b30', isDark: false },
  { id: 'solar',     name: 'Solar',     bgHex: '#faf6f0', tabBGHex: '#f0ebe2', accentHex: '#c84a12', secondaryHex: '#1a6b7a', textHex: '#1c1712', isDark: false },
];
const DEFAULT = THEMES[0];
const CACHE_KEY = 'hb.theme';

export function themeById(id) { return THEMES.find(t => t.id === id) || DEFAULT; }

// ── colour helpers ──
function rgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgba(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }
function mix(hexA, hexB, t) {
  const a = rgb(hexA), b = rgb(hexB);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function applyTheme(theme) {
  const t = typeof theme === 'string' ? themeById(theme) : (theme || DEFAULT);
  const { bgHex, tabBGHex, accentHex: ac, secondaryHex: sec, textHex: tx, isDark } = t;
  const s = document.documentElement.style;
  const set = (k, v) => s.setProperty(k, v);

  set('--bg', bgHex);
  set('--surf', tabBGHex);
  set('--surf2', mix(bgHex, tx, isDark ? 0.09 : 0.07));
  set('--surf3', mix(bgHex, tx, isDark ? 0.15 : 0.12));
  set('--ink', tx);
  set('--muted', rgba(tx, 0.50));
  set('--dim', rgba(tx, 0.22));
  set('--orange', ac);
  set('--orange-lo', rgba(ac, 0.12));
  set('--teal', sec);
  set('--teal-lo', rgba(sec, 0.12));
  set('--border', rgba(tx, isDark ? 0.08 : 0.12));
  set('--border-o', rgba(ac, 0.30));
  set('--glow-o', `0 0 18px ${rgba(ac, 0.55)}, 0 0 56px ${rgba(ac, 0.18)}`);
  set('--glow-t', `0 0 18px ${rgba(sec, 0.5)}, 0 0 56px ${rgba(sec, 0.16)}`);

  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', bgHex);
  document.documentElement.dataset.theme = t.id;
  try { localStorage.setItem(CACHE_KEY, t.id); } catch (_) {}
}

// Apply instantly on load (before settings arrive) to avoid a color flash.
export function applyCachedTheme() {
  try { const id = localStorage.getItem(CACHE_KEY); if (id) applyTheme(id); } catch (_) {}
}

// Apply whatever the synced settings say (called when the store updates).
export function applyThemeFromSettings() {
  const th = store.state.settings?.theme;
  if (th?.bgHex) applyTheme(th); else if (th?.id) applyTheme(th.id);
}

// Persist a chosen theme to settings/app.theme so it carries to the phone.
export async function chooseTheme(id) {
  const t = themeById(id);
  applyTheme(t);
  await updateSettings({ theme: { ...t } });
}

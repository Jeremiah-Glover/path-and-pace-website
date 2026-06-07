// ── Portal entry point ────────────────────────────────────────────────────────
import { auth, onAuthStateChanged, signOut } from './firebase.js';
import { initStore, teardown, subscribe, store } from './store.js';
import { checkNDA, showNDA } from './nda.js';
import { renderOverview } from './overview.js';
import { renderProjectsView, wireProjects } from './projects.js';
import { renderChat } from './chief-chat.js';
import { renderCalendar } from './calendar.js';
import { renderBurrow } from './burrow.js';
import { renderVault } from './vault.js';
import { renderAccount } from './account.js';
import { applyCachedTheme, applyThemeFromSettings } from './themes.js';
import { toast } from './util.js';

// Apply the last-used theme instantly (before settings load) to avoid a flash.
applyCachedTheme();

// View registry — each id maps to a render function. Feature phases register more.
const VIEWS = {
  overview: renderOverview,
  projects: renderProjectsView,
  calendar: renderCalendar,
  burrow:   renderBurrow,
  vault:    renderVault,
  chief:    renderChat,
  account:  renderAccount,
};

// PWA: register the service worker + capture the install prompt.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  window.HBInstall = { prompt: () => e.prompt() };
});

let currentView = 'overview';
let booted = false;

// ── AUTH GUARD ──────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.replace('index.html'); return; }
  try { await boot(user); }
  catch (err) { console.error('boot failed', err); revealApp(); }
});

async function boot(user) {
  if (!(await checkNDA(user.uid))) {
    hideLoading();
    await showNDA(user);    // resolves once signed
  }
  await initStore(user);
  if (!booted) { wireProjects(); wireNav(); booted = true; }

  subscribe(() => { applyThemeFromSettings(); renderOverview(); renderCurrent(); });
  applyThemeFromSettings();
  renderOverview();
  renderCurrent();
  revealApp();
  handleGcalLanding();
  // Keep any existing web-push token fresh (no-op if not yet granted).
  import('./push.js').then(m => m.refreshPushToken()).catch(() => {});
}

// After the Google OAuth bounce-back (?gcal=connected) land on the calendar and
// confirm. Clean the param so a refresh doesn't repeat the toast.
function handleGcalLanding() {
  const g = new URLSearchParams(location.search).get('gcal');
  if (!g) return;
  history.replaceState(null, '', location.pathname);
  if (g === 'connected') { switchView('calendar'); toast('Google Calendar connected ✓'); }
  else toast('Google connection was cancelled or failed');
}

function renderCurrent() {
  const fn = VIEWS[currentView];
  if (fn) { try { fn(); } catch (e) { console.error('render', currentView, e); } }
}

function switchView(id) {
  if (!VIEWS[id]) return;
  currentView = id;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const view = document.getElementById('view' + id[0].toUpperCase() + id.slice(1));
  const tab  = document.querySelector(`[data-view="${id}"]`);
  if (view) view.classList.add('active');
  if (tab) tab.classList.add('active');
  renderCurrent();
}

function wireNav() {
  document.querySelectorAll('.nav-tab').forEach(t =>
    t.addEventListener('click', () => switchView(t.dataset.view)));
  document.getElementById('seeAllBtn')?.addEventListener('click', () => switchView('projects'));
  document.getElementById('signOutBtn').addEventListener('click', async () => {
    teardown(); await signOut(auth); window.location.replace('index.html');
  });
  document.getElementById('navUserName')?.addEventListener('click', () => switchView('chief'));
}

// ── LOADING / REVEAL ──────────────────────────────────────────────────────────
function hideLoading() {
  const ls = document.getElementById('loadingScreen');
  if (ls) { ls.classList.add('fade-out'); setTimeout(() => ls.style.display = 'none', 400); }
}
function revealApp() {
  hideLoading();
  document.getElementById('app').style.display = 'block';
}

// Expose the router so later-phase modules can deep-link between tabs.
window.HB = { switchView };

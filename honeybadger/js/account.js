// ── Account — editable Chief personality + profile, data export, delete ───────
import { auth, signOut, functions, httpsCallable } from './firebase.js';
import { store, updateSettings, teardown } from './store.js';
import { esc, debounce, toast, bluntness01 } from './util.js';
import { THEMES, chooseTheme } from './themes.js';
import { enablePush, pushState, pushSupported } from './push.js';

export function renderAccount() {
  const { settings, profile, user } = store.state;
  const chief = settings?.chief || {};
  const bio = settings?.userBio || {};
  const activeTheme = settings?.theme?.id || 'night-ops';
  const provider = profile.provider || user?.providerData?.[0]?.providerId || '—';
  // Stored 0.0–1.0 (canonical, shared with iOS); the slider shows 0–10.
  const blunt = Math.round(bluntness01(chief.bluntness) * 10);

  const view = document.getElementById('viewAccount');
  view.innerHTML = `
    <div class="view-header"><div><div class="view-title">Account</div>
      <div class="view-sub">Edit Chief &amp; your profile — changes sync to your phone</div></div></div>

    <div class="chief-card">
      <div class="account-section-label">Chief</div>
      <div class="edit-field"><div class="edit-label">Name <span class="edit-save-state" id="s1">saved ✓</span></div>
        <input class="form-input" id="aName" value="${esc(chief.displayName || '')}" placeholder="Chief"></div>
      <div class="edit-field"><div class="edit-label">Backstory <span class="edit-save-state" id="s2">saved ✓</span></div>
        <textarea class="form-input" id="aBack" rows="3" placeholder="Who is Chief to you?">${esc(chief.backstory || '')}</textarea></div>
      <div class="edit-field"><div class="edit-label">Communication style <span class="edit-save-state" id="s3">saved ✓</span></div>
        <input class="form-input" id="aStyle" value="${esc(chief.communicationStyle || '')}" placeholder="e.g. direct, warm, tactical"></div>
      <div class="edit-field"><div class="edit-label">Bluntness <span class="range-val" id="bVal">${blunt}/10</span></div>
        <div class="range-row"><input type="range" id="aBlunt" min="0" max="10" step="1" value="${blunt}"></div></div>
    </div>

    <div class="chief-card">
      <div class="account-section-label">About you</div>
      <div class="form-row">
        <div class="edit-field"><div class="edit-label">First name <span class="edit-save-state" id="s4">saved ✓</span></div>
          <input class="form-input" id="aFirst" value="${esc(bio.name || '')}" placeholder="What Chief calls you"></div>
        <div class="edit-field"><div class="edit-label">Full name <span class="edit-save-state" id="s5">saved ✓</span></div>
          <input class="form-input" id="aFull" value="${esc(bio.fullName || '')}" placeholder="Full legal name"></div>
      </div>
      <div class="edit-field"><div class="edit-label">Bio <span class="edit-save-state" id="s6">saved ✓</span></div>
        <textarea class="form-input" id="aBio" rows="4" placeholder="Context that helps Chief help you">${esc(bio.bio || '')}</textarea></div>
    </div>

    <div class="chief-card">
      <div class="account-section-label">Theme</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:16px;line-height:1.5">Pick a look — it applies here and syncs to your phone and watch.</div>
      <div class="theme-grid">
        ${THEMES.map(t => `<button class="theme-swatch ${t.id === activeTheme ? 'on' : ''}" data-theme="${t.id}" title="${esc(t.name)}">
          <span class="theme-prev" style="background:${t.bgHex};border-color:${t.tabBGHex}">
            <span class="theme-dot" style="background:${t.accentHex}"></span>
            <span class="theme-dot" style="background:${t.secondaryHex}"></span>
          </span>
          <span class="theme-name">${esc(t.name)}</span>
        </button>`).join('')}
      </div>
    </div>

    <div class="account-card">
      <div class="account-section-label">Account</div>
      ${row('Email', esc(user?.email || '—'))}
      ${row('Sign-in', `<span style="text-transform:capitalize">${esc(String(provider).replace('.com',''))}</span>`)}
      ${row('Access', `<span class="stat-chip ${profile.isPremium ? 'chip-orange' : 'chip-teal'}" style="font-size:9px">${profile.isPremium ? 'Premium' : 'Beta'}</span>`)}
      ${row('Role', profile.isAdmin ? 'Admin' : profile.isTester ? 'Tester' : 'Member')}
    </div>

    <div class="account-card">
      <div class="account-section-label">Notifications</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:14px;line-height:1.5">Let Chief send proactive nudges to this browser — blocked projects, stalled work, and check-ins.</div>
      <button class="btn-ghost" id="acPush">Enable notifications</button>
    </div>

    <div class="account-card">
      <div class="account-section-label">Data &amp; privacy</div>
      <div class="view-actions">
        <button class="btn-ghost" id="acInstall" style="display:none">Install app</button>
        <button class="btn-ghost" id="acExport">Export my data (JSON)</button>
        <button class="btn-ghost" id="acSignout">Sign out</button>
        <button class="btn-delete" id="acDelete">Delete account</button>
      </div>
      <div style="font-size:11px;color:var(--dim);margin-top:12px;line-height:1.6">Deleting your account permanently removes your projects, tasks, vault, Chief settings, and memory. This cannot be undone.</div>
    </div>`;

  wire();
}

function row(key, val) {
  return `<div class="account-row"><div class="account-key">${key}</div><div class="account-val">${val}</div></div>`;
}
function flash(id) { const e = document.getElementById(id); if (e) { e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 1200); } }

function wire() {
  const sChief = patch => updateSettings({ chief: { ...(store.state.settings?.chief || {}), ...patch } });
  const sBio   = patch => updateSettings({ userBio: { ...(store.state.settings?.userBio || {}), ...patch } });

  document.getElementById('aName').oninput  = debounce(e => sChief({ displayName: e.target.value }).then(() => flash('s1')));
  document.getElementById('aBack').oninput  = debounce(e => sChief({ backstory: e.target.value }).then(() => flash('s2')));
  document.getElementById('aStyle').oninput = debounce(e => sChief({ communicationStyle: e.target.value }).then(() => flash('s3')));
  const blunt = document.getElementById('aBlunt');
  blunt.oninput  = () => document.getElementById('bVal').textContent = blunt.value + '/10';
  blunt.onchange = () => sChief({ bluntness: Number(blunt.value) / 10 }).then(() => toast('Saved'));

  document.getElementById('aFirst').oninput = debounce(e => sBio({ name: e.target.value }).then(() => flash('s4')));
  document.getElementById('aFull').oninput  = debounce(e => sBio({ fullName: e.target.value }).then(() => flash('s5')));
  document.getElementById('aBio').oninput   = debounce(e => sBio({ bio: e.target.value }).then(() => flash('s6')));

  document.querySelectorAll('.theme-swatch').forEach(b => b.onclick = async () => {
    document.querySelectorAll('.theme-swatch').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    await chooseTheme(b.dataset.theme);
    toast('Theme applied — syncing to your phone');
  });

  // Notifications button reflects current permission state.
  const pushBtn = document.getElementById('acPush');
  (async () => {
    if (!(await pushSupported())) { pushBtn.textContent = 'Not supported in this browser'; pushBtn.disabled = true; return; }
    const st = pushState();
    if (st === 'granted') { pushBtn.textContent = '🔔 Notifications on'; pushBtn.classList.add('on'); }
    else if (st === 'denied') { pushBtn.textContent = 'Blocked in browser settings'; pushBtn.disabled = true; }
  })();
  pushBtn.onclick = async () => {
    pushBtn.disabled = true; pushBtn.textContent = 'Enabling…';
    const ok = await enablePush();
    pushBtn.disabled = false;
    pushBtn.textContent = ok ? '🔔 Notifications on' : 'Enable notifications';
    pushBtn.classList.toggle('on', ok);
  };

  document.getElementById('acExport').onclick = exportData;
  document.getElementById('acSignout').onclick = async () => { teardown(); await signOut(auth); window.location.replace('index.html'); };

  // Install prompt (captured in app.js → window.HBInstall)
  const installBtn = document.getElementById('acInstall');
  if (window.HBInstall) {
    installBtn.style.display = '';
    installBtn.onclick = async () => { window.HBInstall.prompt(); window.HBInstall = null; installBtn.style.display = 'none'; };
  }

  let delArmed = false, delTimer = null;
  document.getElementById('acDelete').onclick = async () => {
    const btn = document.getElementById('acDelete');
    if (!delArmed) {
      delArmed = true; btn.classList.add('confirming'); btn.textContent = 'Tap again to permanently delete';
      delTimer = setTimeout(() => { delArmed = false; btn.classList.remove('confirming'); btn.textContent = 'Delete account'; }, 4000);
      return;
    }
    clearTimeout(delTimer);
    btn.disabled = true; btn.textContent = 'Deleting…';
    try {
      await httpsCallable(functions, 'deleteAccount')();
      teardown();
      await signOut(auth).catch(() => {});
      window.location.replace('index.html?deleted=1');
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Delete account'; btn.classList.remove('confirming'); delArmed = false;
      toast('Delete failed: ' + (err.message || err.code), 'err');
    }
  };
}

function exportData() {
  const { projects, tasks, vault, settings, stats, profile, user } = store.state;
  const payload = {
    exportedAt: new Date().toISOString(),
    account: { email: user?.email, uid: user?.uid, isPremium: !!profile.isPremium },
    settings, stats, projects, tasks, vault,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `honeybadger-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast('Data exported');
}

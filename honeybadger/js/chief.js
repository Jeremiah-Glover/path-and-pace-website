// ── Chief profile (read-only personality view) ────────────────────────────────
// Phase 2 turns this tab into a live chat; the personality summary moves to the
// Account tab. For now this renders the existing read-only Chief profile.
import { store } from './store.js';
import { esc } from './util.js';

export function renderChiefProfile() {
  const { settings, profile, user } = store.state;
  const chief = settings?.chief || {};
  const userBio = settings?.userBio || {};
  const chiefName = esc(chief.displayName || 'Chief');

  let fields = '';
  if (chief.backstory)
    fields += field('Backstory', esc(chief.backstory));
  if (chief.communicationStyle)
    fields += field('Communication style', `<span style="text-transform:capitalize">${esc(chief.communicationStyle)}</span>`);
  if (typeof chief.bluntness === 'number')
    fields += field('Bluntness', `${chief.bluntness} / 10`);
  if (!fields)
    fields = field('Approach', `Direct, opinionated, and energy-aware. Customize ${chiefName}'s name, backstory, and communication style in the iOS app.`);

  const bio = userBio.bio ? `<div style="margin-bottom:24px">
    <div class="account-section-label">About you</div>
    <div style="font-size:14px;font-weight:300;color:var(--muted);line-height:1.7">${esc(userBio.bio)}</div></div>` : '';

  const provider = profile.provider || user?.providerData?.[0]?.providerId || '—';

  document.getElementById('chiefContent').innerHTML = `
    <div class="chief-card">
      <div class="chief-name-big">${chiefName}</div>
      <div class="chief-role-tag">AI Executive Assistant</div>
      <div class="chief-divider"></div>
      ${fields}
    </div>
    <div class="account-card">
      ${bio}
      <div class="account-section-label">Account</div>
      ${row('Email', esc(user?.email || '—'))}
      ${row('Sign-in', `<span style="text-transform:capitalize">${esc(String(provider).replace('.com',''))}</span>`)}
      ${row('Access', `<span class="stat-chip ${profile.isPremium ? 'chip-orange' : 'chip-teal'}" style="font-size:9px">${profile.isPremium ? 'Premium' : 'Beta'}</span>`)}
      ${row('Role', profile.isAdmin ? 'Admin' : profile.isTester ? 'Tester' : 'Member')}
    </div>`;
}

function field(label, val) {
  return `<div class="chief-field"><div class="chief-field-label">${label}</div><div class="chief-field-val">${val}</div></div>`;
}
function row(key, val) {
  return `<div class="account-row"><div class="account-key">${key}</div><div class="account-val">${val}</div></div>`;
}

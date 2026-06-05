// ── Today (overview) ──────────────────────────────────────────────────────────
import { store, setEnergy } from './store.js';
import { renderGrid, openDetail } from './projects.js';
import { esc, toDate, dayKey, isPast, priorityClass, toast } from './util.js';

const QUOTES = [
  "A life well-lived is the actual mission.",
  "One thing done is worth ten things planned.",
  "Ship the thing. Fix it later. Done beats perfect.",
  "Less noise, more signal. What actually matters today?",
  "You're more capable than you're giving yourself credit for.",
  "Clear eyes. Full effort. No excuses.",
  "Progress over perfection. Every time.",
  "Rest is part of the plan, not a reward for finishing.",
];
const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
const ENERGY_WORD = { 1: 'Running low', 2: 'Low', 3: 'Steady', 4: 'Good', 5: 'Firing' };

export function renderOverview() {
  const { profile, settings, user, projects, stats } = store.state;

  const hour = new Date().getHours();
  const tod  = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const fullName = settings?.userBio?.fullName || settings?.userBio?.name || profile.name || user?.displayName || '';
  const first = fullName.split(' ')[0];
  document.getElementById('navUserName').textContent = first || user?.email || '';

  const active   = projects.filter(p => p.phase !== 'complete');
  const critical = active.filter(p => priorityClass(p.priority) === 'high');
  const todayKey = dayKey(new Date());
  const dueToday = active.filter(p => p.dueDate && dayKey(toDate(p.dueDate)) === todayKey);
  const upNext = [...active].sort((a, b) => rank(a) - rank(b)).find(p => p.nextAction);

  const checkedToday = stats?.energyDay === todayKey;
  const energyVal = checkedToday ? (stats.energyToday || 0) : 0;
  const streak = stats?.streak || 0;
  const accessChip = profile.isPremium
    ? `<span class="stat-chip chip-orange">Premium</span>`
    : `<span class="stat-chip chip-teal">Beta</span>`;

  const view = document.getElementById('viewOverview');
  view.innerHTML = `
    <div class="greeting-section">
      <div class="greeting-text">${first ? `Good ${tod}, <em>${esc(first)}.</em>` : `Good ${tod}.`}</div>
      <div class="greeting-quote">${esc(quote)}</div>
    </div>

    <div class="stats-row">
      <div class="stat-card"><div class="stat-num">${active.length}</div><div class="stat-label">Active projects</div></div>
      <div class="stat-card"><div class="stat-num">${critical.length}</div><div class="stat-label">Critical priority</div></div>
      <div class="stat-card"><div class="stat-num teal">${streak}🔥</div><div class="stat-label">Day streak</div></div>
      <div class="stat-card">${accessChip}<div class="stat-label" style="margin-top:4px">Access level</div></div>
    </div>

    <div class="checkin-card">
      <div>
        <div class="checkin-title">${checkedToday ? `Energy today: <em>${ENERGY_WORD[energyVal] || '—'}</em>` : "How's your energy?"}</div>
        <div class="checkin-sub">${checkedToday ? 'Tap to update — Chief adapts to your level.' : 'Check in to keep your streak alive.'}</div>
      </div>
      <div class="energy-pips" id="energyPips">
        ${[1,2,3,4,5].map(n => `<button class="pip ${n <= energyVal ? 'on' : ''}" data-e="${n}" title="${ENERGY_WORD[n]}"></button>`).join('')}
      </div>
    </div>

    ${dueToday.length ? section('Due today', `<div class="agenda-list">${dueToday.map(rowHTML).join('')}</div>`) : ''}
    ${upNext ? section('Up next', `<div class="upnext" data-id="${esc(upNext.id)}">
        <div class="upnext-project">${esc(upNext.name)}</div>
        <div class="upnext-action">${esc(upNext.nextAction)}</div></div>`) : ''}

    <div class="section">
      <div class="section-header">
        <div class="section-title">Active Projects</div>
        <button class="section-action" id="seeAllBtn">See all →</button>
      </div>
      <div class="projects-grid" id="overviewGrid"></div>
    </div>`;

  renderGrid(document.getElementById('overviewGrid'), active.slice(0, 6), 'No active projects');

  document.getElementById('energyPips').querySelectorAll('.pip').forEach(b =>
    b.onclick = async () => { await setEnergy(Number(b.dataset.e)); toast('Energy logged'); });
  view.querySelectorAll('.agenda-row').forEach(r => r.onclick = () => openDetail(r.dataset.id));
  const un = view.querySelector('.upnext'); if (un) un.onclick = () => openDetail(un.dataset.id);
  document.getElementById('seeAllBtn').onclick = () => window.HB?.switchView('projects');
}

function rank(p) {
  const order = { high: 0, medium: 1, low: 2 };
  return order[priorityClass(p.priority)] ?? 3;
}
function section(title, body) {
  return `<div class="section"><div class="section-title" style="margin-bottom:12px">${esc(title)}</div>${body}</div>`;
}
function rowHTML(p) {
  return `<div class="agenda-row" data-id="${esc(p.id)}">
    <div class="agenda-date ${isPast(p.dueDate) ? 'overdue' : ''}">Today</div>
    <div class="agenda-name">${esc(p.name)}</div>
    <div class="card-priority-tag tag-${priorityClass(p.priority)}">${esc(p.priority || 'Important')}</div>
  </div>`;
}

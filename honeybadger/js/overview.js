// ── Overview / Today ──────────────────────────────────────────────────────────
import { store } from './store.js';
import { renderGrid } from './projects.js';
import { esc } from './util.js';

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

export function renderOverview() {
  const { profile, settings, user, projects } = store.state;

  const hour = new Date().getHours();
  const tod  = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const fullName = settings?.userBio?.fullName || settings?.userBio?.name || profile.name || user?.displayName || '';
  const first = fullName.split(' ')[0];

  document.getElementById('greetingText').innerHTML =
    first ? `Good ${tod}, <em>${esc(first)}.</em>` : `Good ${tod}.`;
  document.getElementById('greetingQuote').textContent = quote;
  document.getElementById('navUserName').textContent = first || user?.email || '';

  const active   = projects.filter(p => p.phase !== 'complete');
  const critical = active.filter(p => p.priority === 'Critical' || p.priority === 'high');
  document.getElementById('statActive').textContent = active.length;
  document.getElementById('statHigh').textContent = critical.length;

  if (profile.isPremium) {
    const el = document.getElementById('statAccess');
    el.textContent = 'Premium'; el.className = 'stat-chip chip-orange';
  }

  renderGrid(document.getElementById('overviewGrid'), active.slice(0, 6), 'No active projects');
}

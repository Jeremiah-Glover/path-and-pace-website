// ── Calendar (project/task deadline work-calendar) ────────────────────────────
// Month grid of project due dates with drag-to-reschedule (writes dueDate back to
// Firestore), plus an agenda of upcoming deadlines. Device/Google calendar events
// aren't in Firestore, so this is intentionally a *work* calendar.
import { store, updateProject } from './store.js';
import { openDetail } from './projects.js';
import { esc, toDate, dayKey, priorityClass, toast } from './util.js';

let viewMonth = startOfMonth(new Date());

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Map of dayKey -> [{id,name,priority}] from project due dates.
function deadlinesByDay() {
  const map = {};
  for (const p of store.state.projects) {
    const d = toDate(p.dueDate);
    if (!d) continue;
    const k = dayKey(d);
    (map[k] ||= []).push(p);
  }
  return map;
}

export function renderCalendar() {
  const view = document.getElementById('viewCalendar');
  const byDay = deadlinesByDay();
  const todayKey = dayKey(new Date());

  const year = viewMonth.getFullYear(), month = viewMonth.getMonth();
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  // Leading days from previous month (dimmed)
  for (let i = 0; i < startPad; i++) {
    const d = new Date(year, month, i - startPad + 1);
    cells.push(dayCell(d, byDay, todayKey, true));
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(dayCell(new Date(year, month, day), byDay, todayKey, false));
  }
  // Trailing to complete the last week row
  while (cells.length % 7 !== 0) {
    const d = new Date(year, month, daysInMonth + (cells.length % 7));
    cells.push(dayCell(d, byDay, todayKey, true));
  }

  view.innerHTML = `
    <div class="view-header">
      <div><div class="view-title">Calendar</div><div class="view-sub">Project deadlines · drag a chip to reschedule</div></div>
      <div class="view-actions">
        <button class="btn-ghost" id="calToday">Today</button>
        <button class="btn-ghost" id="calPrev">←</button>
        <button class="btn-ghost" id="calNext">→</button>
      </div>
    </div>
    <div class="cal-month-label">${MONTHS[month]} ${year}</div>
    <div class="cal-grid cal-dow">${DOW.map(d => `<div class="cal-dow-cell">${d}</div>`).join('')}</div>
    <div class="cal-grid" id="calGrid">${cells.join('')}</div>
    ${agendaHTML()}`;

  document.getElementById('calToday').onclick = () => { viewMonth = startOfMonth(new Date()); renderCalendar(); };
  document.getElementById('calPrev').onclick  = () => { viewMonth = new Date(year, month - 1, 1); renderCalendar(); };
  document.getElementById('calNext').onclick  = () => { viewMonth = new Date(year, month + 1, 1); renderCalendar(); };

  wireDragAndClicks();
}

function dayCell(d, byDay, todayKey, dim) {
  const k = dayKey(d);
  const items = byDay[k] || [];
  const isToday = k === todayKey;
  const chips = items.map(p => {
    const pc = priorityClass(p.priority);
    return `<div class="cal-chip cal-chip-${pc}" draggable="true" data-id="${esc(p.id)}" title="${esc(p.name)}">${esc(p.name)}</div>`;
  }).join('');
  return `<div class="cal-cell ${dim ? 'dim' : ''} ${isToday ? 'today' : ''}" data-day="${k}">
    <div class="cal-date">${d.getDate()}</div>
    <div class="cal-chips">${chips}</div>
  </div>`;
}

function agendaHTML() {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const upcoming = store.state.projects
    .map(p => ({ p, d: toDate(p.dueDate) }))
    .filter(x => x.d)
    .sort((a, b) => a.d - b.d);
  const future = upcoming.filter(x => x.d >= now).slice(0, 8);
  const overdue = upcoming.filter(x => x.d < now && x.p.phase !== 'complete');

  const rowFor = (x, over) => `
    <div class="agenda-row" data-id="${esc(x.p.id)}">
      <div class="agenda-date ${over ? 'overdue' : ''}">${x.d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
      <div class="agenda-name">${esc(x.p.name)}</div>
      <div class="card-priority-tag tag-${priorityClass(x.p.priority)}">${esc(x.p.priority || 'Important')}</div>
    </div>`;

  if (!future.length && !overdue.length) return '';
  return `<div class="section" style="margin-top:32px">
    ${overdue.length ? `<div class="section-title" style="color:var(--orange);margin-bottom:10px">Overdue</div>
      <div class="agenda-list">${overdue.map(x => rowFor(x, true)).join('')}</div>` : ''}
    ${future.length ? `<div class="section-title" style="margin:18px 0 10px">Upcoming</div>
      <div class="agenda-list">${future.map(x => rowFor(x, false)).join('')}</div>` : ''}
  </div>`;
}

function wireDragAndClicks() {
  document.querySelectorAll('.cal-chip').forEach(chip => {
    chip.addEventListener('click', e => { e.stopPropagation(); openDetail(chip.dataset.id); });
    chip.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', chip.dataset.id);
      chip.classList.add('dragging');
    });
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
  });
  document.querySelectorAll('.cal-cell').forEach(cell => {
    cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('drop'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('drop'));
    cell.addEventListener('drop', async e => {
      e.preventDefault(); cell.classList.remove('drop');
      const id = e.dataTransfer.getData('text/plain');
      if (!id) return;
      await updateProject(id, { dueDate: cell.dataset.day });
      toast('Deadline moved');
    });
  });
  document.querySelectorAll('.agenda-row').forEach(r =>
    r.addEventListener('click', () => openDetail(r.dataset.id)));
}

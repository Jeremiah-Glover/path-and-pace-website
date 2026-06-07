// ── Calendar (unified: project deadlines + events, shared with the phone) ─────
// Project due dates AND events from users/{uid}/events render together. Create
// events by clicking a day; drag either kind to reschedule (writes back to
// Firestore so the phone shows it on next foreground).
import { store, updateProject, createEvent, updateEvent, deleteEvent } from './store.js';
import { openDetail } from './projects.js';
import { esc, toDate, dayKey, isPast, priorityClass, toast } from './util.js';
import { functions, httpsCallable } from './firebase.js';

let viewMonth = startOfMonth(new Date());
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
// Events mirrored from a device calendar are read-only on the web (edit them at
// the source). Everything else can be dragged/edited here.
// Read-only mirrors (edit at the source). Outlook is excluded — it's two-way, so
// its events are editable here and writes route back to Outlook via the function.
const MIRRORED = new Set(['apple', 'google']);
const mirrorLabel = src =>
  src === 'google' ? 'From Google Calendar — edit it there.' :
  'From your Apple Calendar — edit it on your phone.';
const graphIdOf = id => id.replace(/^outlook-/, '');
const outlookMutate = (action, payload) =>
  httpsCallable(functions, 'outlookMutateEvent')({ action, ...payload });
// Provider config drives the connect/sync/disconnect buttons.
const CAL_PROVIDERS = {
  google:  { label: 'Google',  connectFn: 'googleCalendarConnectUrl',  syncFn: 'syncGoogleCalendar',  disconnectFn: 'disconnectGoogleCalendar',  flag: 'googleCalendarConnectedAt' },
  outlook: { label: 'Outlook', connectFn: 'outlookCalendarConnectUrl', syncFn: 'syncOutlookCalendar', disconnectFn: 'disconnectOutlookCalendar', flag: 'outlookCalendarConnectedAt' },
};

// day -> [{kind:'deadline'|'event', id, label, cls, time}]
function itemsByDay() {
  const map = {};
  for (const p of store.state.projects) {
    const d = toDate(p.dueDate);
    if (!d) continue;
    (map[dayKey(d)] ||= []).push({ kind: 'deadline', id: p.id, label: p.name, cls: priorityClass(p.priority) });
  }
  for (const e of store.state.events) {
    if (!e.day) continue;
    (map[dayKey(e.day)] ||= []).push({ kind: 'event', id: e.id, label: e.title, cls: 'event', min: e.startMinute, src: e.source });
  }
  return map;
}

export function renderCalendar() {
  const view = document.getElementById('viewCalendar');
  const byDay = itemsByDay();
  const todayKey = dayKey(new Date());
  const year = viewMonth.getFullYear(), month = viewMonth.getMonth();
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(dayCell(new Date(year, month, i - startPad + 1), byDay, todayKey, true));
  for (let day = 1; day <= daysInMonth; day++) cells.push(dayCell(new Date(year, month, day), byDay, todayKey, false));
  while (cells.length % 7 !== 0) cells.push(dayCell(new Date(year, month, daysInMonth + (cells.length % 7)), byDay, todayKey, true));

  view.innerHTML = `
    <div class="view-header">
      <div><div class="view-title">Calendar</div><div class="view-sub">Deadlines &amp; events · click a day to add · drag to reschedule</div></div>
      <div class="view-actions">
        <button class="btn-ghost" id="calGoogle">${store.state.profile?.googleCalendarConnectedAt ? 'Google ✓' : 'Connect Google'}</button>
        <button class="btn-ghost" id="calOutlook">${store.state.profile?.outlookCalendarConnectedAt ? 'Outlook ✓' : 'Connect Outlook'}</button>
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
  document.getElementById('calGoogle').onclick  = e => onCalConnect('google', e);
  document.getElementById('calOutlook').onclick = e => onCalConnect('outlook', e);
  wireDragAndClicks();
}

// Connect / sync / disconnect a calendar provider. Connecting does a full-page
// redirect to the provider's consent (no pop-up); the callback bounces back here
// and the backend mirrors events into the shared feed.
async function onCalConnect(provider, e) {
  const cfg = CAL_PROVIDERS[provider];
  const connected = !!store.state.profile?.[cfg.flag];
  if (!connected) {
    toast(`Opening ${cfg.label}…`);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const r = await httpsCallable(functions, cfg.connectFn)({ timeZone: tz });
      const url = r?.data?.url;
      if (url) window.location.href = url;
      else toast(`Could not start ${cfg.label} sign-in`);
    } catch (err) {
      toast(`${cfg.label} connect failed — ${err?.code || err?.message || 'error'}`);
    }
    return;
  }
  // Connected → small menu: Sync now / Disconnect.
  document.getElementById('calDayMenu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'calDayMenu'; menu.className = 'cal-daymenu';
  menu.innerHTML = `
    <div class="cal-daymenu-title">${cfg.label} Calendar</div>
    <button class="btn-primary full sm" id="calSyncNow" style="margin-bottom:8px">Sync now</button>
    <button class="btn-ghost full sm" id="calDisc">Disconnect</button>`;
  positionMenu(menu, e.target);
  document.body.appendChild(menu);
  menu.querySelector('#calSyncNow').onclick = async () => {
    menu.remove(); toast('Syncing…');
    try { const r = await httpsCallable(functions, cfg.syncFn)(); toast(`Synced ${r?.data?.count ?? 0} events`); }
    catch (err) { toast(`Sync failed — ${err?.code || 'error'}`); }
  };
  menu.querySelector('#calDisc').onclick = async () => {
    menu.remove();
    try { await httpsCallable(functions, cfg.disconnectFn)(); toast('Disconnected'); }
    catch (err) { toast(`Disconnect failed — ${err?.code || 'error'}`); }
  };
  dismissOnOutside(menu);
}

function dayCell(d, byDay, todayKey, dim) {
  const k = dayKey(d);
  const items = byDay[k] || [];
  const isToday = k === todayKey;
  const chips = items.map(it => {
    const mirror = it.kind === 'event' && MIRRORED.has(it.src);
    return `<div class="cal-chip cal-chip-${it.cls === 'event' ? 'event' : it.cls}${mirror ? ' cal-chip-mirror' : ''}" draggable="${mirror ? 'false' : 'true'}"
          data-kind="${it.kind}" data-id="${esc(it.id)}" data-src="${esc(it.src || '')}" title="${esc(it.label)}">${esc(it.label)}</div>`;
  }).join('');
  return `<div class="cal-cell ${dim ? 'dim' : ''} ${isToday ? 'today' : ''}" data-day="${k}">
    <div class="cal-date">${d.getDate()}</div><div class="cal-chips">${chips}</div></div>`;
}

function agendaHTML() {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const rows = [];
  store.state.projects.forEach(p => { const d = toDate(p.dueDate); if (d) rows.push({ d, label: p.name, kind: 'deadline', id: p.id, p }); });
  store.state.events.forEach(e => { const d = toDate(e.day); if (d) rows.push({ d, label: e.title, kind: 'event', id: e.id, src: e.source }); });
  rows.sort((a, b) => a.d - b.d);
  const future = rows.filter(x => x.d >= now).slice(0, 10);
  const overdue = rows.filter(x => x.d < now && (x.kind !== 'deadline' || x.p?.phase !== 'complete'));
  const row = (x, over) => `<div class="agenda-row" data-kind="${x.kind}" data-id="${esc(x.id)}" data-src="${esc(x.src || '')}">
    <div class="agenda-date ${over ? 'overdue' : ''}">${x.d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
    <div class="agenda-name">${esc(x.label)}</div>
    <span class="card-priority-tag ${x.kind === 'event' ? 'tag-medium' : 'tag-' + priorityClass(x.p?.priority)}">${x.kind === 'event' ? 'Event' : esc(x.p?.priority || 'Important')}</span>
  </div>`;
  if (!future.length && !overdue.length) return '';
  return `<div class="section" style="margin-top:32px">
    ${overdue.length ? `<div class="section-title" style="color:var(--orange);margin-bottom:10px">Overdue</div><div class="agenda-list">${overdue.map(x => row(x, true)).join('')}</div>` : ''}
    ${future.length ? `<div class="section-title" style="margin:18px 0 10px">Upcoming</div><div class="agenda-list">${future.map(x => row(x, false)).join('')}</div>` : ''}
  </div>`;
}

function reschedule(kind, id, day, src) {
  if (kind === 'event' && src === 'outlook') {
    const ev = store.state.events.find(x => x.id === id);
    return outlookMutate('update', { graphId: graphIdOf(id), day,
      startMinute: ev?.startMinute ?? -1, durationMin: ev?.durationMin || 60, title: ev?.title || 'Event' });
  }
  if (kind === 'event') return updateEvent(id, { day });
  return updateProject(id, { dueDate: day });
}
function openItem(kind, id, src) {
  if (kind === 'event' && src === 'outlook') { editOutlookEvent(id); return; }
  if (kind === 'event' && MIRRORED.has(src)) { toast(mirrorLabel(src)); return; }
  if (kind === 'event') editEvent(id);
  else openDetail(id);
}

function wireDragAndClicks() {
  document.querySelectorAll('.cal-chip').forEach(chip => {
    const mirror = MIRRORED.has(chip.dataset.src);
    chip.addEventListener('click', e => { e.stopPropagation(); openItem(chip.dataset.kind, chip.dataset.id, chip.dataset.src); });
    if (mirror) return; // read-only: no drag
    chip.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', `${chip.dataset.kind}:${chip.dataset.id}:${chip.dataset.src || ''}`); chip.classList.add('dragging'); });
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
  });
  document.querySelectorAll('.cal-cell').forEach(cell => {
    cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('drop'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('drop'));
    cell.addEventListener('drop', async e => {
      e.preventDefault(); cell.classList.remove('drop');
      const raw = e.dataTransfer.getData('text/plain'); if (!raw) return;
      // id may itself contain ':' (Outlook graph ids), so kind=first, src=last.
      const parts = raw.split(':');
      const kind = parts[0], src = parts[parts.length - 1], id = parts.slice(1, -1).join(':');
      await reschedule(kind, id, cell.dataset.day, src);
      toast('Rescheduled');
    });
    cell.addEventListener('click', e => { if (e.target.closest('.cal-chip')) return; openDayMenu(cell, cell.dataset.day); });
  });
  document.querySelectorAll('.agenda-row').forEach(r => r.addEventListener('click', () => openItem(r.dataset.kind, r.dataset.id, r.dataset.src)));
}

// Day popover: add an event, or set a project's deadline to this day.
function openDayMenu(cell, day) {
  document.getElementById('calDayMenu')?.remove();
  const ps = store.state.projects;
  const pretty = new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const menu = document.createElement('div');
  menu.id = 'calDayMenu'; menu.className = 'cal-daymenu';
  menu.innerHTML = `
    <div class="cal-daymenu-title">${esc(pretty)}</div>
    <input class="form-input" id="calNewEvent" placeholder="New event…" style="margin-bottom:8px">
    <input class="form-input" id="calNewTime" type="time" style="margin-bottom:8px" title="Optional time — set one to get a reminder on all your devices">
    <button class="btn-primary full sm" id="calAddEvent" style="margin-bottom:8px">Add event</button>
    ${store.state.profile?.outlookCalendarConnectedAt ? `<button class="btn-ghost full sm" id="calAddOutlook" style="margin-bottom:12px">Add to Outlook</button>` : ''}
    ${ps.length ? `<div class="cal-daymenu-title">Set a deadline</div>
      <select class="form-input" id="calDayPick"><option value="">Choose a project…</option>
        ${ps.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>` : ''}`;
  positionMenu(menu, cell);
  document.body.appendChild(menu);

  const titleEl = menu.querySelector('#calNewEvent');
  titleEl.focus();
  const add = async () => {
    const t = titleEl.value.trim(); if (!t) return;
    const timeStr = menu.querySelector('#calNewTime')?.value || '';
    let startMinute = -1;
    if (timeStr) { const [h, mn] = timeStr.split(':').map(Number); startMinute = h * 60 + mn; }
    await createEvent({ title: t, day, startMinute });
    menu.remove(); toast(startMinute >= 0 ? 'Event added · reminder set' : 'Event added');
  };
  menu.querySelector('#calAddEvent').onclick = add;
  titleEl.onkeydown = e => { if (e.key === 'Enter') add(); };
  const outlookBtn = menu.querySelector('#calAddOutlook');
  if (outlookBtn) outlookBtn.onclick = async () => {
    const t = titleEl.value.trim(); if (!t) { toast('Enter a title'); return; }
    const timeStr = menu.querySelector('#calNewTime')?.value || '';
    let startMinute = -1;
    if (timeStr) { const [h, mn] = timeStr.split(':').map(Number); startMinute = h * 60 + mn; }
    menu.remove(); toast('Adding to Outlook…');
    try { await outlookMutate('create', { title: t, day, startMinute, durationMin: 60 }); toast('Added to Outlook'); }
    catch (err) { toast(`Outlook add failed — ${err?.code || 'error'}`); }
  };
  const pick = menu.querySelector('#calDayPick');
  if (pick) pick.onchange = async () => { if (pick.value) { await updateProject(pick.value, { dueDate: day }); menu.remove(); toast('Deadline set'); } };
  dismissOnOutside(menu);
}

// Event editor popover: rename or delete.
function editEvent(id) {
  document.getElementById('calDayMenu')?.remove();
  const e = store.state.events.find(x => x.id === id); if (!e) return;
  const menu = document.createElement('div');
  menu.id = 'calDayMenu'; menu.className = 'cal-daymenu';
  menu.innerHTML = `
    <div class="cal-daymenu-title">Edit event</div>
    <input class="form-input" id="calEvTitle" value="${esc(e.title)}" style="margin-bottom:10px">
    <div class="view-actions"><button class="btn-ghost sm" id="calEvDel">Delete</button><button class="btn-primary sm" id="calEvSave">Save</button></div>`;
  const chip = document.querySelector(`.cal-chip[data-id="${CSS.escape(id)}"]`) || document.body;
  positionMenu(menu, chip);
  document.body.appendChild(menu);
  menu.querySelector('#calEvSave').onclick = async () => {
    await updateEvent(id, { title: menu.querySelector('#calEvTitle').value.trim() || 'Untitled' });
    menu.remove(); toast('Saved');
  };
  menu.querySelector('#calEvDel').onclick = async () => { await deleteEvent(id); menu.remove(); toast('Event deleted'); };
  dismissOnOutside(menu);
}

// Outlook event editor — title/delete route back to Outlook (two-way).
function editOutlookEvent(id) {
  document.getElementById('calDayMenu')?.remove();
  const e = store.state.events.find(x => x.id === id); if (!e) return;
  const menu = document.createElement('div');
  menu.id = 'calDayMenu'; menu.className = 'cal-daymenu';
  menu.innerHTML = `
    <div class="cal-daymenu-title">Edit Outlook event</div>
    <input class="form-input" id="calEvTitle" value="${esc(e.title)}" style="margin-bottom:10px">
    <div class="view-actions"><button class="btn-ghost sm" id="calEvDel">Delete</button><button class="btn-primary sm" id="calEvSave">Save</button></div>`;
  const chip = document.querySelector(`.cal-chip[data-id="${CSS.escape(id)}"]`) || document.body;
  positionMenu(menu, chip);
  document.body.appendChild(menu);
  menu.querySelector('#calEvSave').onclick = async () => {
    const title = menu.querySelector('#calEvTitle').value.trim() || 'Untitled';
    menu.remove(); toast('Saving to Outlook…');
    try { await outlookMutate('update', { graphId: graphIdOf(id), day: e.day, startMinute: e.startMinute, durationMin: e.durationMin || 60, title }); toast('Saved to Outlook'); }
    catch (err) { toast(`Outlook save failed — ${err?.code || 'error'}`); }
  };
  menu.querySelector('#calEvDel').onclick = async () => {
    menu.remove(); toast('Deleting…');
    try { await outlookMutate('delete', { graphId: graphIdOf(id) }); toast('Deleted from Outlook'); }
    catch (err) { toast(`Outlook delete failed — ${err?.code || 'error'}`); }
  };
  dismissOnOutside(menu);
}

function positionMenu(menu, anchor) {
  const r = (anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { bottom: 100, left: 100 });
  menu.style.top = `${Math.min(window.innerHeight - 180, r.bottom + window.scrollY + 4)}px`;
  menu.style.left = `${Math.min(window.innerWidth - 260, (r.left || 100) + window.scrollX)}px`;
}
function dismissOnOutside(menu) {
  setTimeout(() => document.addEventListener('click', function off(ev) {
    if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', off); }
  }), 0);
}

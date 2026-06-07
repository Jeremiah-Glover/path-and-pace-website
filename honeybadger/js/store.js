// ── Central store ─────────────────────────────────────────────────────────────
// Holds all portal state and is the ONLY place that writes to Firestore. Feature
// modules read `store.state`, call mutation helpers, and subscribe() for updates.
// Mirrors the iOS Firestore schema:
//   users/{uid}/projects/{id}          project docs
//   users/{uid}/tasks/{projectID}      { items: [ {id,title,status,...} ] }
//   users/{uid}/settings/app           chief personality + userBio
//   users/{uid}/vault/{fileId}         vault documents  (added this release)
//   users/{uid}/stats/summary          energy + streak  (added this release)
//   users/{uid}/reminders/{id}         cross-device reminders (fired server-side)
import {
  db, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, onSnapshot, serverTimestamp
} from './firebase.js';
import { uid as newId, dayKey } from './util.js';

export const store = {
  state: {
    user: null,
    profile: {},
    settings: null,
    projects: [],
    tasks: {},     // projectID -> [ items ]
    vault: [],
    stats: {},
    events: [],    // unified calendar events (shared with the phone)
  },
  _subs: new Set(),
  _unsub: [],
};

export function subscribe(fn) { store._subs.add(fn); return () => store._subs.delete(fn); }
function emit() { store._subs.forEach(fn => { try { fn(store.state); } catch (e) { console.error(e); } }); }

function uref(...path) { return doc(db, 'users', store.state.user.uid, ...path); }
function ucol(name)    { return collection(db, 'users', store.state.user.uid, name); }

// ── Boot ───────────────────────────────────────────────────────────────────────
export async function initStore(user) {
  store.state.user = user;
  const [profileSnap, settingsSnap] = await Promise.all([
    getDoc(doc(db, 'users', user.uid)).catch(() => null),
    getDoc(uref('settings', 'app')).catch(() => null),
  ]);
  store.state.profile  = profileSnap?.exists()  ? profileSnap.data()  : {};
  store.state.settings = settingsSnap?.exists() ? settingsSnap.data() : null;
  attachListeners(user.uid);
  emit();
}

export function teardown() {
  store._unsub.forEach(u => { try { u(); } catch (_) {} });
  store._unsub = [];
}

function attachListeners(uid) {
  teardown();

  // Projects (+ task items refreshed on each change)
  store._unsub.push(onSnapshot(ucol('projects'), async snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => millis(b.updatedAt) - millis(a.updatedAt));
    store.state.projects = docs;
    await refreshTasks(uid);
    emit();
  }, err => console.error('projects listener', err.code, err.message)));

  // Vault (best-effort — collection may not exist until iOS syncs)
  store._unsub.push(onSnapshot(ucol('vault'), snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => millis(b.dateAdded) - millis(a.dateAdded));
    store.state.vault = docs;
    emit();
  }, () => { /* no vault yet — fine */ }));

  // Stats summary (energy + streak)
  store._unsub.push(onSnapshot(uref('stats', 'summary'), snap => {
    store.state.stats = snap.exists() ? snap.data() : {};
    emit();
  }, () => {}));

  // Settings (theme + persona) — live so theme picks on the phone reflect here
  // without a reload, and vice-versa.
  store._unsub.push(onSnapshot(uref('settings', 'app'), snap => {
    if (snap.exists()) { store.state.settings = snap.data(); emit(); }
  }, () => {}));

  // Unified calendar events (created on web or mirrored from the phone).
  store._unsub.push(onSnapshot(ucol('events'), snap => {
    store.state.events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    emit();
  }, () => {}));
}

async function refreshTasks(uid) {
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'tasks'));
    const map = {};
    snap.docs.forEach(d => { map[d.id] = (d.data().items || []); });
    store.state.tasks = map;
  } catch (_) { /* keep previous */ }
}

function millis(v) {
  return v?.toMillis?.() ?? (typeof v === 'number' ? v : 0);
}

// ── Derived helpers ──────────────────────────────────────────────────────────
export function taskCounts(projectID) {
  const items = store.state.tasks[projectID] || [];
  return {
    total: items.length,
    done: items.filter(t => t.status === 'done').length,
    inProgress: items.filter(t => t.status === 'inProgress').length,
    blocked: items.filter(t => t.status === 'blocked').length,
    todo: items.filter(t => t.status === 'todo').length,
  };
}

export function projectName(id) {
  return store.state.projects.find(p => p.id === id)?.name || '';
}

// ── PROJECTS ─────────────────────────────────────────────────────────────────
export async function createProject(fields) {
  const ref = doc(ucol('projects'));
  const data = {
    id: ref.id,
    name: fields.name,
    priority: fields.priority || 'Important',
    phase: fields.phase || 'Build',
    progress: fields.progress ?? 0,
    editCount: 0,
    colorHex: '#FF5500',
    lastPhase: fields.phase || 'Build',
    dependencyIDs: fields.dependencyIDs || [],
    nextAction: fields.nextAction || '',
    blocker: fields.blocker || '',
    dueDate: fields.dueDate || '',
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, data);
  return ref.id;
}

export async function updateProject(id, patch) {
  await updateDoc(uref('projects', id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteProject(id) {
  await deleteDoc(uref('projects', id));
  await deleteDoc(uref('tasks', id)).catch(() => {});
}

// ── TASKS (stored as one doc per project: { items: [...] }) ───────────────────
async function writeTasks(projectID, items) {
  store.state.tasks[projectID] = items;       // optimistic
  emit();
  await setDoc(uref('tasks', projectID), { items, updatedAt: serverTimestamp() }, { merge: true });
}

export function getTasks(projectID) { return store.state.tasks[projectID] || []; }

export async function addTask(projectID, title) {
  const items = [...getTasks(projectID)];
  items.push({ id: newId(), title: title.trim(), status: 'todo', createdAt: Date.now() });
  await writeTasks(projectID, items);
}

export async function updateTask(projectID, taskId, patch) {
  const items = getTasks(projectID).map(t => t.id === taskId ? { ...t, ...patch } : t);
  await writeTasks(projectID, items);
}

export async function deleteTask(projectID, taskId) {
  await writeTasks(projectID, getTasks(projectID).filter(t => t.id !== taskId));
}

export async function reorderTasks(projectID, items) {
  await writeTasks(projectID, items);
}

// Move a task to another project.
export async function moveTask(fromPID, taskId, toPID) {
  const task = getTasks(fromPID).find(t => t.id === taskId);
  if (!task) return;
  await writeTasks(fromPID, getTasks(fromPID).filter(t => t.id !== taskId));
  await writeTasks(toPID, [...getTasks(toPID), task]);
}

// ── CALENDAR EVENTS (unified, shared with the phone) ──────────────────────────
export async function createEvent(fields) {
  const ref = doc(ucol('events'));
  const data = {
    id: ref.id,
    title: fields.title || 'Untitled',
    day: fields.day,                       // "YYYY-MM-DD"
    startMinute: fields.startMinute ?? -1, // -1 = all-day
    durationMin: fields.durationMin ?? 0,
    notes: fields.notes || '',
    projectId: fields.projectId || '',
    projectName: fields.projectName || '',
    source: 'web',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, data);
  await syncEventReminder(ref.id, data);
  return ref.id;
}
export async function updateEvent(id, patch) {
  await updateDoc(uref('events', id), { ...patch, updatedAt: serverTimestamp() });
  const ev = { ...(store.state.events.find(e => e.id === id) || {}), ...patch };
  await syncEventReminder(id, ev);
}
export async function deleteEvent(id) {
  await deleteDoc(uref('events', id));
  await deleteDoc(uref('reminders', id)).catch(() => {});
}

// ── CROSS-DEVICE REMINDERS ────────────────────────────────────────────────────
// A timed event writes an absolute fireAt (in THIS browser's timezone) so the
// fireReminders Cloud Function can alert every device — including the phone — when
// it's due. All-day / past events carry no reminder.
function eventFireAt(day, startMinute) {
  if (startMinute == null || startMinute < 0 || !day) return null;
  const [y, m, d] = String(day).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, Math.floor(startMinute / 60), startMinute % 60, 0, 0);
}

export async function syncEventReminder(id, ev) {
  const fireAt = eventFireAt(ev.day, ev.startMinute);
  if (!fireAt || fireAt.getTime() < Date.now() - 60000) {
    await deleteDoc(uref('reminders', id)).catch(() => {});  // no time / in the past
    return;
  }
  const hh = fireAt.getHours(), mm = fireAt.getMinutes();
  const pretty = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
  await setDoc(uref('reminders', id), {
    id, title: ev.title || 'Reminder', body: `Starts at ${pretty}.`,
    fireAt, sent: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sourceType: 'event', sourceId: id,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ── VAULT ───────────────────────────────────────────────────────────────────
export async function createVaultFile(fields) {
  const id = fields.id || newId();
  const data = {
    id,
    name: fields.name || 'Untitled',
    type: fields.type || 'doc',           // recording | doc | image | pdf | other
    projectId: fields.projectId || '',
    projectName: fields.projectName || '',
    content: fields.content || '',
    size: fields.size || `${(fields.content || '').length} chars`,
    source: fields.source || 'web',
    dateAdded: fields.dateAdded || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(uref('vault', id), data);
  return id;
}

export async function updateVaultFile(id, patch) {
  await updateDoc(uref('vault', id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteVaultFile(id) {
  await deleteDoc(uref('vault', id));
}

// ── STATS (energy + streak) ───────────────────────────────────────────────────
export async function setEnergy(level) {
  const today = dayKey(new Date());
  const s = store.state.stats || {};
  let streak = s.streak || 0;
  if (s.lastCheckIn !== today) {
    // New day check-in → extend or reset streak.
    const yesterday = dayKey(new Date(Date.now() - 86400000));
    streak = (s.lastCheckIn === yesterday) ? streak + 1 : 1;
  }
  await setDoc(uref('stats', 'summary'), {
    energyToday: level,
    energyDay: today,
    lastCheckIn: today,
    streak,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
export async function updateSettings(patch) {
  store.state.settings = { ...(store.state.settings || {}), ...patch };
  await setDoc(uref('settings', 'app'), patch, { merge: true });
  emit();
}

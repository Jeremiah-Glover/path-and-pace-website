// ── Small shared helpers ──────────────────────────────────────────────────────

// HTML-escape untrusted strings before injecting into innerHTML.
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Chief bluntness is canonically 0.0–1.0 in Firestore (the iOS scale).
// Older web builds wrote 0–10; accept either form and return 0–1.
export function bluntness01(raw) {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return 0.5;
  const v = raw > 1 ? raw / 10 : raw;
  return Math.min(1, Math.max(0, v));
}

// Coerce Firestore Timestamp | number | ISO string | '' into a Date or null.
export function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    // Bare "YYYY-MM-DD" must be parsed as LOCAL midnight, not UTC — otherwise
    // negative-offset zones render it as the previous day (the calendar
    // drag-drop off-by-one). Construct the date in local time explicitly.
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

// 'Jun 5, 2026' style.
export function fmtDate(v, opts) {
  const d = toDate(v);
  if (!d) return '';
  return d.toLocaleDateString('en-US', opts || { month: 'short', day: 'numeric', year: 'numeric' });
}

// 'YYYY-MM-DD' in local time (for <input type=date> and day keys).
export function dayKey(d) {
  const x = (d instanceof Date) ? d : (toDate(d) || new Date());
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}

export function isPast(v) {
  const d = toDate(v);
  if (!d) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d < today;
}

// Debounce — used for live-saving edited fields without hammering Firestore.
export function debounce(fn, ms = 600) {
  let t;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  return wrapped;
}

export function uid() {
  return (crypto?.randomUUID?.() || 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
}

// ── Toasts ─────────────────────────────────────────────────────────────────────
let toastHost = null;
export function toast(msg, kind = 'ok') {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    document.body.appendChild(toastHost);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  toastHost.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 300);
  }, kind === 'err' ? 5000 : 2600);
}

// Priority → CSS class (handles new + legacy values).
export function priorityClass(p) {
  if (p === 'Critical' || p === 'high')      return 'high';
  if (p === 'Important' || p === 'medium')   return 'medium';
  return 'low';
}

export const PHASES = ['Ideation', 'Build', 'Launch', 'Maintenance'];
export const PRIORITIES = ['Critical', 'Important', 'Nice-to-have'];
export const TASK_STATUSES = ['todo', 'inProgress', 'blocked', 'done'];

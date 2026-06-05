// ── The Burrow — power tools that are painful on a phone ───────────────────────
// Sub-panels: Board (kanban), Tasks (master list), Map (dependencies), Bulk,
// Capture (brain-dump → projects/tasks), Export (CSV + weekly review).
import { store, updateProject, createProject, getTasks, updateTask, addTask, taskCounts } from './store.js';
import { openDetail } from './projects.js';
import { askChiefJSON } from './chief-chat.js';
import { esc, priorityClass, toast, PHASES, PRIORITIES } from './util.js';

const PANELS = [
  ['board', 'Board'], ['tasks', 'Tasks'], ['map', 'Dependencies'],
  ['bulk', 'Bulk edit'], ['capture', 'Brain dump'], ['export', 'Export'],
];
let panel = 'board';
let selected = new Set();   // bulk selection

export function renderBurrow() {
  const view = document.getElementById('viewBurrow');
  view.innerHTML = `
    <div class="view-header">
      <div><div class="view-title">The Burrow</div><div class="view-sub">Where the heavy project tools live</div></div>
    </div>
    <div class="seg burrow-nav" id="burrowNav">
      ${PANELS.map(([id, label]) => `<button data-p="${id}" class="${id === panel ? 'on' : ''}">${label}</button>`).join('')}
    </div>
    <div id="burrowPanel"></div>`;
  view.querySelectorAll('#burrowNav button').forEach(b =>
    b.onclick = () => { panel = b.dataset.p; renderBurrow(); });
  renderPanel();
}

function renderPanel() {
  const el = document.getElementById('burrowPanel');
  ({ board: boardPanel, tasks: tasksPanel, map: mapPanel,
     bulk: bulkPanel, capture: capturePanel, export: exportPanel }[panel] || boardPanel)(el);
}

// ── BOARD (kanban by phase) ───────────────────────────────────────────────────
function boardPanel(el) {
  const ps = store.state.projects;
  el.innerHTML = `<div class="kanban">${PHASES.map(phase => {
    const items = ps.filter(p => (p.phase || 'Build') === phase);
    return `<div class="kan-col" data-phase="${phase}">
      <div class="kan-head">${phase} <span class="kan-count">${items.length}</span></div>
      <div class="kan-drop" data-phase="${phase}">
        ${items.map(kanCard).join('') || '<div class="kan-empty">—</div>'}
      </div></div>`;
  }).join('')}</div>`;

  el.querySelectorAll('.kan-card').forEach(c => {
    c.addEventListener('click', () => openDetail(c.dataset.id));
    c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); });
    c.addEventListener('dragend', () => c.classList.remove('dragging'));
  });
  el.querySelectorAll('.kan-drop').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drop'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop'));
    col.addEventListener('drop', async e => {
      e.preventDefault(); col.classList.remove('drop');
      const id = e.dataTransfer.getData('text/plain');
      if (id) { await updateProject(id, { phase: col.dataset.phase }); toast('Moved to ' + col.dataset.phase); }
    });
  });
}
function kanCard(p) {
  const pc = priorityClass(p.priority);
  const tc = taskCounts(p.id);
  return `<div class="kan-card p-${pc}" draggable="true" data-id="${esc(p.id)}">
    <div class="kan-name">${esc(p.name)}</div>
    <div class="kan-meta">
      <span class="card-priority-tag tag-${pc}">${esc(p.priority || 'Important')}</span>
      ${tc.total ? `<span class="card-task-count">${tc.done}/${tc.total}</span>` : ''}
    </div></div>`;
}

// ── MASTER TASK BOARD ─────────────────────────────────────────────────────────
let taskFilter = 'open';
function tasksPanel(el) {
  const rows = [];
  for (const p of store.state.projects) {
    for (const t of getTasks(p.id)) rows.push({ p, t });
  }
  const filtered = rows.filter(({ t }) =>
    taskFilter === 'all' ? true :
    taskFilter === 'open' ? t.status !== 'done' :
    t.status === taskFilter);

  const FILTERS = [['open','Open'],['all','All'],['inProgress','Doing'],['blocked','Blocked'],['done','Done']];
  el.innerHTML = `
    <div class="seg" style="margin-bottom:16px">
      ${FILTERS.map(([id, l]) => `<button data-f="${id}" class="${id === taskFilter ? 'on' : ''}">${l}</button>`).join('')}
    </div>
    <div class="task-list">
      ${filtered.length ? filtered.map(({ p, t }) => `
        <div class="task-row ${t.status === 'done' ? 'done' : ''}" data-pid="${esc(p.id)}" data-tid="${esc(t.id)}">
          <button class="task-check ${t.status === 'done' ? 'done' : (t.status === 'blocked' ? 'blocked' : '')}">${t.status === 'done' ? '✓' : (t.status === 'blocked' ? '!' : '')}</button>
          <span class="task-title" style="cursor:default">${esc(t.title)}</span>
          <span class="mtask-project" data-open="${esc(p.id)}">${esc(p.name)}</span>
        </div>`).join('')
      : `<div style="color:var(--dim);font-size:13px;padding:20px;text-align:center">No tasks in this filter.</div>`}
    </div>`;

  el.querySelectorAll('.seg button').forEach(b => b.onclick = () => { taskFilter = b.dataset.f; tasksPanel(el); });
  el.querySelectorAll('.task-row').forEach(row => {
    row.querySelector('.task-check').onclick = async () => {
      const cur = getTasks(row.dataset.pid).find(t => t.id === row.dataset.tid)?.status;
      await updateTask(row.dataset.pid, row.dataset.tid, { status: cur === 'done' ? 'todo' : 'done' });
      tasksPanel(el);
    };
    row.querySelector('.mtask-project').onclick = () => openDetail(row.dataset.pid);
  });
}

// ── DEPENDENCY MAP ────────────────────────────────────────────────────────────
function mapPanel(el) {
  const ps = store.state.projects;
  const byId = Object.fromEntries(ps.map(p => [p.id, p]));
  const dependents = {};   // id -> [projects that depend on it]
  ps.forEach(p => (p.dependencyIDs || []).forEach(dep => (dependents[dep] ||= []).push(p)));

  const withRel = ps.filter(p => (p.dependencyIDs || []).length || dependents[p.id]);
  if (!withRel.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🕸️</div>
      <div class="empty-title">No dependencies yet</div>
      <div class="empty-sub">Link projects in their detail view to map what blocks what.</div></div>`;
    return;
  }
  el.innerHTML = `<div class="dep-grid">${withRel.map(p => {
    const deps = (p.dependencyIDs || []).map(id => byId[id]?.name).filter(Boolean);
    const dps = (dependents[p.id] || []).map(x => x.name);
    return `<div class="dep-node" data-id="${esc(p.id)}">
      <div class="dep-name">${esc(p.name)}</div>
      ${deps.length ? `<div class="dep-line"><span class="dep-tag dep-needs">needs</span> ${deps.map(esc).join(', ')}</div>` : ''}
      ${dps.length ? `<div class="dep-line"><span class="dep-tag dep-enables">enables</span> ${dps.map(esc).join(', ')}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
  el.querySelectorAll('.dep-node').forEach(n => n.onclick = () => openDetail(n.dataset.id));
}

// ── BULK EDIT ─────────────────────────────────────────────────────────────────
function bulkPanel(el) {
  const ps = store.state.projects;
  el.innerHTML = `
    <div class="bulk-bar">
      <select class="form-input" id="bulkPriority" style="width:auto"><option value="">Set priority…</option>${PRIORITIES.map(p => `<option>${p}</option>`).join('')}</select>
      <select class="form-input" id="bulkPhase" style="width:auto"><option value="">Set phase…</option>${PHASES.map(p => `<option>${p}</option>`).join('')}</select>
      <button class="btn-ghost" id="bulkArchive">Archive</button>
      <button class="btn-primary" id="bulkApply">Apply to <span id="bulkN">0</span></button>
    </div>
    <div class="projects-grid" style="margin-top:18px">
      ${ps.map(p => `<label class="bulk-card ${selected.has(p.id) ? 'sel' : ''}" data-id="${esc(p.id)}">
        <input type="checkbox" ${selected.has(p.id) ? 'checked' : ''} style="accent-color:var(--orange)">
        <div><div class="card-name" style="font-size:15px">${esc(p.name)}</div>
          <div class="card-meta"><span class="card-phase">${esc(p.phase || '')}</span>
          <span class="card-priority-tag tag-${priorityClass(p.priority)}">${esc(p.priority || 'Important')}</span></div></div>
      </label>`).join('')}
    </div>`;

  const updateN = () => document.getElementById('bulkN').textContent = selected.size;
  el.querySelectorAll('.bulk-card').forEach(card => {
    const cb = card.querySelector('input');
    cb.onchange = () => { cb.checked ? selected.add(card.dataset.id) : selected.delete(card.dataset.id); card.classList.toggle('sel', cb.checked); updateN(); };
  });
  updateN();

  const apply = async patch => {
    if (!selected.size) { toast('Select projects first', 'err'); return; }
    for (const id of selected) await updateProject(id, patch);
    toast(`Updated ${selected.size} project(s)`);
    selected.clear(); bulkPanel(el);
  };
  document.getElementById('bulkApply').onclick = () => {
    const patch = {};
    const pr = document.getElementById('bulkPriority').value;
    const ph = document.getElementById('bulkPhase').value;
    if (pr) patch.priority = pr;
    if (ph) patch.phase = ph;
    if (!Object.keys(patch).length) { toast('Pick a priority or phase', 'err'); return; }
    apply(patch);
  };
  document.getElementById('bulkArchive').onclick = () => apply({ phase: 'complete' });
}

// ── BRAIN DUMP → CHIEF NEGOTIATION ────────────────────────────────────────────
// Paste a messy brain dump; Chief summarizes it into structured projects + tasks
// that you fine-tune in a "negotiation" step before anything is created.
let proposal = null;   // [{name, priority, phase, nextAction, tasks:[]}]

const PLANNER_SYS =
  `You are Chief, a sharp chief of staff. Turn the user's brain dump into an organized plan. ` +
  `Group related thoughts into PROJECTS. For each project give: a short clear name, a priority ` +
  `(exactly one of: Critical, Important, Nice-to-have), a phase (exactly one of: Ideation, Build, Launch, Maintenance), ` +
  `a one-line nextAction, and a list of concrete tasks. ` +
  `Respond with STRICT JSON only — no prose, no markdown fences — in this exact shape: ` +
  `{"summary":"one or two sentences","projects":[{"name":"","priority":"Important","phase":"Build","nextAction":"","tasks":["",""]}]}`;

function capturePanel(el) {
  if (proposal) { renderNegotiation(el); return; }
  el.innerHTML = `
    <div class="capture-help">Dump everything on your mind — half-thoughts, to-dos, ideas. Chief will summarize it and propose projects &amp; tasks you can fine-tune before anything is created.</div>
    <textarea class="form-input" id="dumpText" rows="12" placeholder="Type or paste your brain dump…" style="margin:16px 0"></textarea>
    <button class="btn-primary" id="dumpBtn">Ask Chief to organize this →</button>`;

  document.getElementById('dumpBtn').onclick = async () => {
    const text = document.getElementById('dumpText').value.trim();
    if (!text) { toast('Type a brain dump first', 'err'); return; }
    const btn = document.getElementById('dumpBtn');
    btn.disabled = true; btn.textContent = 'Chief is thinking…';
    try {
      const raw = await askChiefJSON(PLANNER_SYS, text);
      const parsed = parsePlan(raw);
      if (!parsed?.projects?.length) throw new Error('no projects');
      proposal = parsed.projects.map(normalizeProject);
      proposal._summary = parsed.summary || '';
      renderNegotiation(el);
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Ask Chief to organize this →';
      toast("Chief couldn't organize that — try again or add more detail.", 'err');
    }
  };
}

function parsePlan(raw) {
  if (!raw) return null;
  let s = raw.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}
function normalizeProject(p) {
  const pr = PRIORITIES.includes(p.priority) ? p.priority : 'Important';
  const ph = PHASES.includes(p.phase) ? p.phase : 'Build';
  return {
    name: String(p.name || 'Untitled').slice(0, 120),
    priority: pr, phase: ph,
    nextAction: String(p.nextAction || ''),
    tasks: Array.isArray(p.tasks) ? p.tasks.map(t => String(t)).filter(Boolean) : [],
  };
}

function renderNegotiation(el) {
  el.innerHTML = `
    <div class="nego-head">
      <div><div class="nego-title">Chief's proposal</div>
        ${proposal._summary ? `<div class="nego-summary">${esc(proposal._summary)}</div>` : ''}</div>
      <div class="view-actions">
        <button class="btn-ghost" id="negoDiscard">Start over</button>
        <button class="btn-primary" id="negoCreate">Create ${proposal.length} project(s)</button>
      </div>
    </div>
    <div id="negoList">${proposal.map((p, i) => negoCard(p, i)).join('')}</div>`;

  document.getElementById('negoDiscard').onclick = () => { proposal = null; capturePanel(el); };
  document.getElementById('negoCreate').onclick = () => createFromProposal(el);
  wireNego(el);
}

function negoCard(p, i) {
  return `<div class="nego-card" data-i="${i}">
    <div class="nego-card-top">
      <input class="form-input nego-name" value="${esc(p.name)}" data-f="name">
      <button class="task-del nego-remove" title="Remove project">✕</button>
    </div>
    <div class="form-row" style="margin-bottom:10px">
      <div><div class="edit-label">Priority</div>
        <select class="form-input" data-f="priority">${PRIORITIES.map(x => `<option ${x === p.priority ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div><div class="edit-label">Phase</div>
        <select class="form-input" data-f="phase">${PHASES.map(x => `<option ${x === p.phase ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    </div>
    <div class="edit-label">Next action</div>
    <input class="form-input" value="${esc(p.nextAction)}" data-f="nextAction" style="margin-bottom:12px">
    <div class="edit-label">Tasks</div>
    <div class="task-list nego-tasks">
      ${p.tasks.map((t, ti) => `<div class="task-row" data-ti="${ti}">
        <input class="task-title" value="${esc(t)}" data-tf="title">
        <button class="task-del" data-tact="del">✕</button></div>`).join('')}
    </div>
    <div class="task-add"><input class="form-input nego-newtask" placeholder="Add a task…"><button class="btn-ghost nego-addtask">Add</button></div>
  </div>`;
}

function wireNego(el) {
  el.querySelectorAll('.nego-card').forEach(card => {
    const i = Number(card.dataset.i);
    card.querySelectorAll('[data-f]').forEach(inp => inp.onchange = () => { proposal[i][inp.dataset.f] = inp.value; });
    card.querySelector('.nego-remove').onclick = () => { proposal.splice(i, 1); if (!proposal.length) { proposal = null; capturePanel(el); } else renderNegotiation(el); };
    card.querySelectorAll('.nego-tasks .task-row').forEach(row => {
      const ti = Number(row.dataset.ti);
      row.querySelector('[data-tf=title]').onchange = e => proposal[i].tasks[ti] = e.target.value;
      row.querySelector('[data-tact=del]').onclick = () => { proposal[i].tasks.splice(ti, 1); renderNegotiation(el); };
    });
    const addTaskFn = () => { const inp = card.querySelector('.nego-newtask'); if (inp.value.trim()) { proposal[i].tasks.push(inp.value.trim()); renderNegotiation(el); } };
    card.querySelector('.nego-addtask').onclick = addTaskFn;
    card.querySelector('.nego-newtask').onkeydown = e => { if (e.key === 'Enter') addTaskFn(); };
  });
}

async function createFromProposal(el) {
  const btn = document.getElementById('negoCreate');
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    let np = 0, nt = 0;
    for (const p of proposal) {
      const id = await createProject({ name: p.name, priority: p.priority, phase: p.phase, nextAction: p.nextAction });
      np++;
      for (const t of p.tasks) { await addTask(id, t); nt++; }
    }
    toast(`Created ${np} project(s), ${nt} task(s)`);
    proposal = null;
    panel = 'board'; renderBurrow();
  } catch (err) {
    btn.disabled = false; btn.textContent = 'Create projects';
    toast('Error: ' + (err.code || err.message), 'err');
  }
}

// ── EXPORT + WEEKLY REVIEW ────────────────────────────────────────────────────
function exportPanel(el) {
  const ps = store.state.projects;
  const active = ps.filter(p => p.phase !== 'complete');
  let totalTasks = 0, doneTasks = 0, blocked = 0;
  ps.forEach(p => { const c = taskCounts(p.id); totalTasks += c.total; doneTasks += c.done; blocked += c.blocked; });
  const critical = active.filter(p => priorityClass(p.priority) === 'high');

  el.innerHTML = `
    <div class="stats-row">
      <div class="stat-card"><div class="stat-num">${active.length}</div><div class="stat-label">Active projects</div></div>
      <div class="stat-card"><div class="stat-num">${critical.length}</div><div class="stat-label">Critical</div></div>
      <div class="stat-card"><div class="stat-num teal">${doneTasks}/${totalTasks}</div><div class="stat-label">Tasks done</div></div>
      <div class="stat-card"><div class="stat-num">${blocked}</div><div class="stat-label">Blocked tasks</div></div>
    </div>
    <div class="view-actions" style="margin-bottom:18px">
      <button class="btn-primary" id="expCsv">Download CSV</button>
      <button class="btn-ghost" id="expMd">Copy weekly review</button>
    </div>
    <div class="review-card"><div class="detail-text" id="reviewText">${esc(weeklyReview())}</div></div>`;

  document.getElementById('expCsv').onclick = downloadCSV;
  document.getElementById('expMd').onclick = async () => {
    try { await navigator.clipboard.writeText(weeklyReview()); toast('Weekly review copied'); }
    catch { toast('Copy failed — select the text manually', 'err'); }
  };
}

function weeklyReview() {
  const ps = store.state.projects;
  const active = ps.filter(p => p.phase !== 'complete');
  const crit = active.filter(p => priorityClass(p.priority) === 'high');
  const blockers = active.filter(p => p.blocker);
  let lines = [`HoneyBadger — Weekly Review (${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })})`, ''];
  lines.push(`Active projects: ${active.length}  ·  Critical: ${crit.length}`, '');
  if (crit.length) { lines.push('TOP PRIORITIES'); crit.forEach(p => lines.push(`• ${p.name}${p.nextAction ? ` — next: ${p.nextAction}` : ''}`)); lines.push(''); }
  if (blockers.length) { lines.push('BLOCKERS'); blockers.forEach(p => lines.push(`• ${p.name}: ${p.blocker}`)); lines.push(''); }
  lines.push('ALL ACTIVE');
  active.forEach(p => { const c = taskCounts(p.id); lines.push(`• ${p.name} [${p.phase || 'Build'}] ${c.total ? `${c.done}/${c.total} tasks` : ''}`); });
  return lines.join('\n');
}

function downloadCSV() {
  const rows = [['Project', 'Priority', 'Phase', 'Progress', 'Due', 'Tasks done', 'Tasks total', 'Next action', 'Blocker']];
  for (const p of store.state.projects) {
    const c = taskCounts(p.id);
    const due = p.dueDate ? (p.dueDate.toDate ? p.dueDate.toDate() : new Date(p.dueDate)) : null;
    rows.push([p.name, p.priority || 'Important', p.phase || 'Build', (p.progress ?? 0) + '%',
      due && !isNaN(due) ? due.toISOString().slice(0, 10) : '', c.done, c.total, p.nextAction || '', p.blocker || '']);
  }
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `honeybadger-projects-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('CSV downloaded');
}

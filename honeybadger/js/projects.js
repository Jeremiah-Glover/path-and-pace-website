// ── Projects: grid cards, create wizard, editable detail + tasks ──────────────
import { store, createProject, updateProject, deleteProject,
         getTasks, addTask, updateTask, deleteTask, taskCounts } from './store.js';
import { esc, fmtDate, isPast, debounce, priorityClass, toast,
         PHASES, PRIORITIES } from './util.js';

// ── CARD (shared with overview / cabinet) ─────────────────────────────────────
export function cardHTML(p) {
  const name = esc(p.name || 'Untitled');
  const pc   = priorityClass(p.priority);
  const phase = esc(p.phase || '');
  const next  = p.nextAction ? esc(p.nextAction) : '';
  const due   = p.dueDate ? `<span class="card-deadline${isPast(p.dueDate) ? ' overdue' : ''}">${fmtDate(p.dueDate)}</span>` : '';
  const prog  = typeof p.progress === 'number'
    ? `<div class="card-progress"><div class="card-progress-bar" style="width:${Math.min(100, p.progress)}%"></div></div>` : '';
  const block = p.blocker ? `<div class="card-blocker">⚠ ${esc(p.blocker)}</div>` : '';
  const tc = taskCounts(p.id);
  const tcHTML = tc.total > 0 ? `<span class="card-task-count">${tc.done}/${tc.total} tasks</span>` : '';
  return `
    <div class="project-card p-${pc}" data-id="${esc(p.id)}">
      <div class="card-top">
        <div class="card-name">${name}</div>
        <div class="card-priority-tag tag-${pc}">${esc(p.priority || 'Important')}</div>
      </div>
      ${next ? `<div class="card-brief">${next}</div>` : ''}
      ${prog}${block}
      <div class="card-meta">
        ${phase ? `<span class="card-phase">${phase}</span>` : ''}
        ${tcHTML}${due}
      </div>
    </div>`;
}

export function emptyHTML(msg, sub = 'Projects you add in the iOS app appear here too.') {
  return `<div class="empty-state"><div class="empty-icon">📋</div>
    <div class="empty-title">${esc(msg)}</div><div class="empty-sub">${esc(sub)}</div></div>`;
}

export function attachCardListeners(containerEl) {
  containerEl.querySelectorAll('.project-card').forEach(card =>
    card.addEventListener('click', () => openDetail(card.dataset.id)));
}

export function renderGrid(el, projects, emptyMsg) {
  el.innerHTML = projects.length ? projects.map(cardHTML).join('') : emptyHTML(emptyMsg);
  attachCardListeners(el);
}

// ── PROJECTS VIEW ─────────────────────────────────────────────────────────────
export function renderProjectsView() {
  const ps = store.state.projects;
  const active = ps.filter(p => p.phase !== 'complete');
  document.getElementById('projectsSub').textContent = `${active.length} active · ${ps.length} total`;
  renderGrid(document.getElementById('allProjectsGrid'), ps, 'No projects yet');
}

// ── DETAIL MODAL (editable) ───────────────────────────────────────────────────
let activeId = null;
let delTimer = null;

function seg(field, value, options, teal) {
  return `<div class="seg ${teal ? 'teal' : ''}" data-seg="${field}">
    ${options.map(o => `<button data-val="${esc(o)}" class="${o === value ? 'on' : ''}">${esc(o)}</button>`).join('')}
  </div>`;
}

function flash(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1200);
}

export function openDetail(id) {
  const p = store.state.projects.find(x => x.id === id);
  if (!p) return;
  activeId = id;
  resetDelete();

  document.getElementById('detailName').value = p.name || '';

  const pc = priorityClass(p.priority);
  document.getElementById('detailBadges').innerHTML =
    `<span class="card-priority-tag tag-${pc}">${esc(p.priority || 'Important')}</span>` +
    (p.phase ? ` <span class="card-phase">${esc(p.phase)}</span>` : '') +
    (typeof p.progress === 'number' ? ` <span class="card-phase">${p.progress}%</span>` : '');

  const deps = store.state.projects.filter(x => x.id !== id);
  const depChecked = new Set(p.dependencyIDs || []);

  document.getElementById('detailBody').innerHTML = `
    <div class="edit-field">
      <div class="edit-label">Next action <span class="edit-save-state" id="ss-next">saved ✓</span></div>
      <textarea class="form-input" id="f-next" rows="2" placeholder="What's the immediate next step?">${esc(p.nextAction || '')}</textarea>
    </div>
    <div class="edit-field">
      <div class="edit-label">Blocker <span class="edit-save-state" id="ss-block">saved ✓</span></div>
      <textarea class="form-input" id="f-block" rows="2" placeholder="Anything in the way?">${esc(p.blocker || '')}</textarea>
    </div>
    <div class="form-row">
      <div class="edit-field"><div class="edit-label">Priority</div>${seg('priority', p.priority || 'Important', PRIORITIES)}</div>
      <div class="edit-field"><div class="edit-label">Phase</div>${seg('phase', p.phase || 'Build', PHASES, true)}</div>
    </div>
    <div class="edit-field">
      <div class="edit-label">Progress <span class="range-val" id="prog-val">${p.progress ?? 0}%</span></div>
      <div class="range-row"><input type="range" id="f-prog" min="0" max="100" step="5" value="${p.progress ?? 0}"></div>
    </div>
    <div class="edit-field">
      <div class="edit-label">Due date <span class="edit-save-state" id="ss-due">saved ✓</span></div>
      <input type="date" class="form-input" id="f-due" value="${dueInputVal(p.dueDate)}">
    </div>
    ${deps.length ? `<div class="edit-field">
      <div class="edit-label">Dependencies</div>
      <div id="f-deps" style="display:flex;flex-direction:column;gap:6px">
        ${deps.map(d => `<label style="display:flex;gap:9px;align-items:center;font-size:13px;color:var(--muted);cursor:pointer">
          <input type="checkbox" value="${esc(d.id)}" ${depChecked.has(d.id) ? 'checked' : ''} style="accent-color:var(--teal)">
          ${esc(d.name)}</label>`).join('')}
      </div></div>` : ''}
    <div class="detail-section">
      <div class="detail-section-label">Tasks</div>
      <div class="task-list" id="taskList"></div>
      <div class="task-add">
        <input class="form-input" id="newTask" placeholder="Add a task…">
        <button class="btn-ghost" id="addTaskBtn">Add</button>
      </div>
    </div>`;

  wireEdits(id);
  renderTasks(id);
  document.getElementById('detailModal').style.display = 'flex';
}

function dueInputVal(v) {
  if (!v) return '';
  const d = v.toDate ? v.toDate() : new Date(v);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function wireEdits(id) {
  const saveNext = debounce(v => updateProject(id, { nextAction: v }).then(() => flash('ss-next')));
  const saveBlock = debounce(v => updateProject(id, { blocker: v }).then(() => flash('ss-block')));
  document.getElementById('detailName').oninput = debounce(e => updateProject(id, { name: e.target.value.trim() || 'Untitled' }));
  document.getElementById('f-next').oninput  = e => saveNext(e.target.value.trim());
  document.getElementById('f-block').oninput = e => saveBlock(e.target.value.trim());

  document.querySelectorAll('[data-seg]').forEach(grp => {
    grp.querySelectorAll('button').forEach(btn => btn.onclick = () => {
      grp.querySelectorAll('button').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      updateProject(id, { [grp.dataset.seg]: btn.dataset.val }).then(() => toast('Saved'));
    });
  });

  const prog = document.getElementById('f-prog');
  prog.oninput = () => document.getElementById('prog-val').textContent = prog.value + '%';
  prog.onchange = () => updateProject(id, { progress: Number(prog.value) }).then(() => toast('Progress saved'));

  document.getElementById('f-due').onchange = e =>
    updateProject(id, { dueDate: e.target.value || '' }).then(() => flash('ss-due'));

  const depsBox = document.getElementById('f-deps');
  if (depsBox) depsBox.querySelectorAll('input').forEach(cb => cb.onchange = () => {
    const ids = [...depsBox.querySelectorAll('input:checked')].map(x => x.value);
    updateProject(id, { dependencyIDs: ids }).then(() => toast('Dependencies saved'));
  });

  document.getElementById('addTaskBtn').onclick = submitTask(id);
  document.getElementById('newTask').onkeydown = e => { if (e.key === 'Enter') submitTask(id)(); };
}

function submitTask(id) {
  return async () => {
    const input = document.getElementById('newTask');
    const v = input.value.trim();
    if (!v) return;
    input.value = '';
    await addTask(id, v);
    renderTasks(id);
  };
}

const NEXT_STATUS = { todo: 'inProgress', inProgress: 'done', done: 'todo', blocked: 'todo' };
const STATUS_LABEL = { todo: 'To do', inProgress: 'Doing', done: 'Done', blocked: 'Blocked' };

function renderTasks(id) {
  const el = document.getElementById('taskList');
  if (!el) return;
  const items = getTasks(id);
  if (!items.length) { el.innerHTML = `<div style="font-size:12px;color:var(--dim);padding:6px 2px">No tasks yet.</div>`; return; }
  el.innerHTML = items.map(t => {
    const done = t.status === 'done';
    const checkCls = done ? 'done' : (t.status === 'blocked' ? 'blocked' : '');
    return `<div class="task-row ${done ? 'done' : ''}" data-tid="${esc(t.id)}">
      <button class="task-check ${checkCls}" data-act="check">${done ? '✓' : (t.status === 'blocked' ? '!' : '')}</button>
      <input class="task-title" value="${esc(t.title)}" data-act="title">
      <button class="task-status-btn" data-act="status">${STATUS_LABEL[t.status] || 'To do'}</button>
      <button class="task-del" data-act="del">✕</button>
    </div>`;
  }).join('');

  el.querySelectorAll('.task-row').forEach(row => {
    const tid = row.dataset.tid;
    row.querySelector('[data-act=check]').onclick = async () => {
      const cur = getTasks(id).find(t => String(t.id) === tid)?.status;
      await updateTask(id, tid, { status: cur === 'done' ? 'todo' : 'done' });
      renderTasks(id);
    };
    row.querySelector('[data-act=status]').onclick = async () => {
      const cur = getTasks(id).find(t => String(t.id) === tid)?.status || 'todo';
      await updateTask(id, tid, { status: NEXT_STATUS[cur] });
      renderTasks(id);
    };
    row.querySelector('[data-act=title]').onchange = e => updateTask(id, tid, { title: e.target.value.trim() });
    row.querySelector('[data-act=del]').onclick = async () => { await deleteTask(id, tid); renderTasks(id); };
  });
}

// ── DELETE ────────────────────────────────────────────────────────────────────
function resetDelete() {
  clearTimeout(delTimer);
  const btn = document.getElementById('deleteProjectBtn');
  btn.textContent = 'Delete project'; btn.classList.remove('confirming'); btn.disabled = false;
}
export function closeDetail() {
  document.getElementById('detailModal').style.display = 'none';
  resetDelete(); activeId = null;
}

// ── CREATE WIZARD ─────────────────────────────────────────────────────────────
export function openAddModal() {
  document.getElementById('addForm').reset();
  const save = document.getElementById('saveBtn');
  save.disabled = false; save.textContent = 'Save project';
  document.getElementById('step1').classList.add('active');
  document.getElementById('step2').classList.remove('active');
  document.getElementById('addModal').style.display = 'flex';
}

// ── WIRING (called once at boot) ──────────────────────────────────────────────
export function wireProjects() {
  document.getElementById('detailClose').onclick = closeDetail;
  document.getElementById('detailModal').onclick = e => { if (e.target.id === 'detailModal') closeDetail(); };

  document.getElementById('deleteProjectBtn').onclick = async () => {
    const btn = document.getElementById('deleteProjectBtn');
    if (!btn.classList.contains('confirming')) {
      btn.classList.add('confirming'); btn.textContent = 'Tap again to confirm';
      delTimer = setTimeout(resetDelete, 3000); return;
    }
    resetDelete(); btn.textContent = 'Deleting…'; btn.disabled = true;
    try { await deleteProject(activeId); closeDetail(); toast('Project deleted'); }
    catch (err) { btn.textContent = `Error: ${err.code || 'unknown'}`; btn.disabled = false; }
  };

  document.getElementById('addProjectBtn').onclick = openAddModal;
  document.getElementById('addModalClose').onclick = () => document.getElementById('addModal').style.display = 'none';
  document.getElementById('addModal').onclick = e => { if (e.target.id === 'addModal') e.currentTarget.style.display = 'none'; };

  document.getElementById('toStep2').onclick = () => {
    const name = document.getElementById('pName').value.trim();
    if (!name) { document.getElementById('pName').focus(); return; }
    const due = document.getElementById('pDeadline').value;
    const pr  = document.getElementById('pPriority').value;
    const ph  = document.getElementById('pPhase').value;
    const na  = document.getElementById('pNextAction').value.trim();
    document.getElementById('reviewCard').innerHTML = `
      <div class="review-row"><span class="review-key">Project</span><span class="review-val">${esc(name)}</span></div>
      ${due ? `<div class="review-row"><span class="review-key">Due</span><span class="review-val">${fmtDate(due + 'T12:00:00')}</span></div>` : ''}
      <div class="review-row"><span class="review-key">Priority</span><span class="review-val">${esc(pr)}</span></div>
      <div class="review-row"><span class="review-key">Phase</span><span class="review-val">${esc(ph)}</span></div>
      ${na ? `<div class="review-brief">${esc(na)}</div>` : ''}`;
    document.getElementById('step1').classList.remove('active');
    document.getElementById('step2').classList.add('active');
  };
  document.getElementById('backBtn').onclick = () => {
    document.getElementById('step2').classList.remove('active');
    document.getElementById('step1').classList.add('active');
  };

  document.getElementById('addForm').onsubmit = async e => {
    e.preventDefault();
    const save = document.getElementById('saveBtn');
    save.disabled = true; save.textContent = 'Saving…';
    try {
      await createProject({
        name: document.getElementById('pName').value.trim(),
        dueDate: document.getElementById('pDeadline').value,
        priority: document.getElementById('pPriority').value,
        phase: document.getElementById('pPhase').value,
        nextAction: document.getElementById('pNextAction').value.trim(),
      });
      document.getElementById('addModal').style.display = 'none';
      toast('Project created');
    } catch (err) {
      save.textContent = 'Error — try again'; save.disabled = false;
      document.querySelector('#step2 .step-label').textContent = `Error: ${err.code || err.message || 'unknown'}`;
    }
  };
}

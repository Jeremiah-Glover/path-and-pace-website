// ── Vault — browse + edit documents (recordings, notes, docs) ─────────────────
// Reads users/{uid}/vault synced from iOS; lets you read, edit content, rename,
// retag to another project, delete, search, and create web notes. Editing a
// recording's transcript is the headline "hard on a phone" win.
import { store, createVaultFile, updateVaultFile, deleteVaultFile } from './store.js';
import { esc, fmtDate, debounce, toast } from './util.js';

let search = '';
let projFilter = '';
let activeFile = null;

const ICON = { recording: '🎙️', doc: '📄', image: '🖼️', pdf: '📕', other: '📎' };

export function renderVault() {
  const view = document.getElementById('viewVault');
  const projects = store.state.projects;
  let files = store.state.vault.slice();

  if (projFilter) files = files.filter(f => f.projectId === projFilter);
  if (search) {
    const q = search.toLowerCase();
    files = files.filter(f => (f.name || '').toLowerCase().includes(q) || (f.content || '').toLowerCase().includes(q));
  }

  view.innerHTML = `
    <div class="view-header">
      <div><div class="view-title">Vault</div><div class="view-sub">${store.state.vault.length} document(s) · synced from your phone &amp; watch</div></div>
      <button class="btn-primary" id="vaultNew">+ New note</button>
    </div>
    <div class="vault-toolbar">
      <input class="form-input" id="vaultSearch" placeholder="Search names &amp; contents…" value="${esc(search)}" style="flex:1">
      <select class="form-input" id="vaultProj" style="width:auto">
        <option value="">All projects</option>
        ${projects.map(p => `<option value="${esc(p.id)}" ${p.id === projFilter ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select>
    </div>
    <div class="vault-grid" id="vaultGrid">
      ${files.length ? files.map(fileCard).join('') : emptyVault()}
    </div>`;

  const s = document.getElementById('vaultSearch');
  s.oninput = debounce(e => { search = e.target.value; renderVault(); restoreFocus(); }, 250);
  document.getElementById('vaultProj').onchange = e => { projFilter = e.target.value; renderVault(); };
  document.getElementById('vaultNew').onclick = newNote;
  view.querySelectorAll('.vault-card').forEach(c => c.onclick = () => openFile(c.dataset.id));
}

let _refocus = false;
function restoreFocus() { const s = document.getElementById('vaultSearch'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }

function emptyVault() {
  return `<div class="empty-state"><div class="empty-icon">🗄️</div>
    <div class="empty-title">${search || projFilter ? 'No matches' : 'Vault is empty'}</div>
    <div class="empty-sub">Recordings and notes from your phone and watch land here. Or add a note above.</div></div>`;
}

function fileCard(f) {
  const preview = (f.content || '').slice(0, 140);
  return `<div class="vault-card" data-id="${esc(f.id)}">
    <div class="vault-card-top">
      <span class="vault-icon">${ICON[f.type] || ICON.other}</span>
      <span class="vault-name">${esc(f.name || 'Untitled')}</span>
    </div>
    ${preview ? `<div class="vault-preview">${esc(preview)}</div>` : '<div class="vault-preview dim">No text content</div>'}
    <div class="vault-meta">
      ${f.projectName ? `<span class="vault-tag">${esc(f.projectName)}</span>` : ''}
      <span class="vault-date">${fmtDate(f.dateAdded)}</span>
    </div>
  </div>`;
}

async function newNote() {
  const id = await createVaultFile({ name: 'New note', type: 'doc', content: '', source: 'web' });
  toast('Note created');
  // openFile will find it after the snapshot lands; poll briefly.
  const tryOpen = (n = 0) => {
    if (store.state.vault.find(f => f.id === id)) openFile(id);
    else if (n < 20) setTimeout(() => tryOpen(n + 1), 100);
  };
  tryOpen();
}

// ── EDITOR MODAL ──────────────────────────────────────────────────────────────
function ensureModal() {
  let m = document.getElementById('vaultModal');
  if (m) return m;
  m = document.createElement('div');
  m.id = 'vaultModal'; m.className = 'detail-overlay'; m.style.display = 'none';
  m.innerHTML = `
    <div class="detail-modal">
      <div class="detail-header">
        <div style="flex:1">
          <input class="detail-name" id="vfName" placeholder="Document name">
          <div class="detail-badges"><span class="vault-icon" id="vfIcon"></span><span class="card-phase" id="vfMeta"></span></div>
        </div>
        <button class="modal-close" id="vfClose">✕</button>
      </div>
      <div class="detail-body">
        <div class="edit-field">
          <div class="edit-label">Project</div>
          <select class="form-input" id="vfProject"></select>
        </div>
        <div class="edit-field">
          <div class="edit-label">Content <span class="edit-save-state" id="vfSaved">saved ✓</span></div>
          <textarea class="form-input" id="vfContent" rows="14" placeholder="Transcript or note text…"></textarea>
        </div>
      </div>
      <div class="detail-footer">
        <span style="font-family:var(--mono);font-size:9px;letter-spacing:0.12em;color:var(--dim)">Changes save automatically</span>
        <button class="btn-delete" id="vfDelete">Delete</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.onclick = e => { if (e.target.id === 'vaultModal') closeFile(); };
  document.getElementById('vfClose').onclick = closeFile;
  return m;
}

let vfDelTimer = null;
function openFile(id) {
  const f = store.state.vault.find(x => x.id === id);
  if (!f) return;
  activeFile = id;
  const m = ensureModal();
  document.getElementById('vfName').value = f.name || '';
  document.getElementById('vfIcon').textContent = ICON[f.type] || ICON.other;
  document.getElementById('vfMeta').textContent = `${f.type || 'doc'} · ${fmtDate(f.dateAdded)}${f.source ? ' · ' + f.source : ''}`;
  document.getElementById('vfContent').value = f.content || '';

  const sel = document.getElementById('vfProject');
  sel.innerHTML = `<option value="">— Unassigned —</option>` +
    store.state.projects.map(p => `<option value="${esc(p.id)}" ${p.id === f.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

  const flash = () => { const s = document.getElementById('vfSaved'); s.classList.add('show'); setTimeout(() => s.classList.remove('show'), 1200); };
  document.getElementById('vfName').oninput = debounce(e => updateVaultFile(id, { name: e.target.value.trim() || 'Untitled' }));
  document.getElementById('vfContent').oninput = debounce(e => {
    const v = e.target.value;
    updateVaultFile(id, { content: v, size: `${v.length} chars` }).then(flash);
  }, 700);
  sel.onchange = e => {
    const pid = e.target.value;
    const pname = store.state.projects.find(p => p.id === pid)?.name || '';
    updateVaultFile(id, { projectId: pid, projectName: pname }).then(() => toast('Moved'));
  };

  resetVfDelete();
  document.getElementById('vfDelete').onclick = async () => {
    const btn = document.getElementById('vfDelete');
    if (!btn.classList.contains('confirming')) {
      btn.classList.add('confirming'); btn.textContent = 'Tap again to confirm';
      vfDelTimer = setTimeout(resetVfDelete, 3000); return;
    }
    btn.disabled = true; btn.textContent = 'Deleting…';
    try { await deleteVaultFile(id); closeFile(); toast('Deleted'); }
    catch (err) { btn.textContent = 'Error'; btn.disabled = false; }
  };

  m.style.display = 'flex';
}
function resetVfDelete() {
  clearTimeout(vfDelTimer);
  const btn = document.getElementById('vfDelete');
  if (btn) { btn.textContent = 'Delete'; btn.classList.remove('confirming'); btn.disabled = false; }
}
function closeFile() {
  const m = document.getElementById('vaultModal');
  if (m) m.style.display = 'none';
  activeFile = null; resetVfDelete();
}

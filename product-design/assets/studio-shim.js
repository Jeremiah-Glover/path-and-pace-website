/* Connects the Studio to Product Design storage. Library (garments, photos) is shared
   across every project; looks, votes and notes belong to the open project. */
(() => {
  const qp = new URLSearchParams(location.search);
  let project = qp.get('p') || '';
  const GLOBAL = new Set(['garments', 'photos']);
  const scopeFor = (coll) => (GLOBAL.has(coll) ? 'global' : project || 'noproject');

  function collection(coll, order) {
    const scope = scopeFor(coll);
    const api = {
      orderBy: (field, dir = 'asc') => collection(coll, { field, dir }),
      doc: (id) => ({
        set: (data) => PD.doc.put(scope, coll, id, data),
        delete: () => PD.doc.del(scope, coll, id),
        get: async () => { const d = await PD.doc.get(scope, coll, id); return { exists: !!d, data: () => d }; },
      }),
      add: async (data) => { const id = PD.uid(); await PD.doc.put(scope, coll, id, data); kick(); return { id }; },
      onSnapshot(cb, onErr) {
        const docs = new Map(); let since = 0; let stopped = false; let timer;
        const emit = () => {
          let arr = [...docs.entries()].map(([id, data]) => ({ id, data: () => data }));
          if (order) arr.sort((a, b) => { const x = a.data()[order.field] ?? 0, y = b.data()[order.field] ?? 0; return order.dir === 'desc' ? (y > x ? 1 : y < x ? -1 : 0) : (x > y ? 1 : x < y ? -1 : 0); });
          cb({ docs: arr });
        };
        const tick = async () => {
          if (stopped) return;
          try {
            const r = await PD.api(`db/${scope}/${coll}?since=${since}`);
            let changed = since === 0;
            for (const d of r.docs) { docs.set(d.id, d.data); changed = true; }
            for (const id of r.deleted || []) { if (docs.delete(id)) changed = true; }
            since = Math.max(since, r.now - 1500);
            if (changed) emit();
          } catch (e) { onErr && onErr(e); }
          timer = setTimeout(tick, document.hidden ? 15000 : 4000);
        };
        listeners.add(() => { clearTimeout(timer); tick(); });
        tick();
        return () => { stopped = true; clearTimeout(timer); };
      },
    };
    return api;
  }
  const listeners = new Set();
  const kick = () => setTimeout(() => listeners.forEach((f) => f()), 150);
  const wrapWrite = (fn) => async (...a) => { const r = await fn(...a); kick(); return r; };

  let me = null, team = null;
  const caps = {
    db: {
      collection: (c) => {
        const col = collection(c);
        const doc = col.doc;
        col.doc = (id) => { const d = doc(id); d.set = wrapWrite(d.set); d.delete = wrapWrite(d.delete); return d; };
        return col;
      },
    },
    assets: { upload: async (blob) => { const r = await PD.upload(blob); return { id: r.id, url: r.url }; } },
    downloads: {
      save: async ({ filename, data }) => {
        const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
        const a = document.createElement('a'); a.href = url; a.download = filename || 'download'; document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      },
    },
    user: {
      id: async () => { me = me || (await PD.api('me')).user; return me.email; },
      profiles: async (ids) => {
        team = team || (await PD.api('users')).users;
        const out = {};
        ids.forEach((id) => { const u = team.find((x) => x.email === id); if (u) out[id] = { name: u.email === (me && me.email) ? 'You' : u.name }; });
        return out;
      },
    },
  };
  window.claude = { use: async (name) => caps[name] || null };

  // Project picker in the header.
  (async () => {
    const sel = document.getElementById('projSel');
    try {
      const list = (await PD.doc.list('global', 'projects')).map((d) => d.data).filter(Boolean).sort((a, b) => (b.updated || 0) - (a.updated || 0));
      if (!project && list.length) { project = list[0].id; history.replaceState(null, '', '?p=' + encodeURIComponent(project)); location.reload(); return; }
      if (!sel) return;
      sel.innerHTML = list.map((p) => `<option value="${PD.esc(p.id)}" ${p.id === project ? 'selected' : ''}>${PD.esc((p.brand ? p.brand + ' · ' : '') + p.name)}</option>`).join('') || '<option>No projects yet</option>';
      sel.onchange = () => { location.href = '/product-design/studio?p=' + encodeURIComponent(sel.value); };
    } catch {}
  })();
})();

/* Path & Pace Product Design — shared client helpers */
const PD = (() => {
  const BASE = '/product-design';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const r2 = (n) => Math.round(n * 100) / 100;
  const usd = (n, dp = 2) => (n == null || isNaN(n) ? '—' : (n < 0 ? '-$' : '$') + Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
  const usd0 = (n) => usd(n, 0);

  async function api(path, opts = {}) {
    const o = { credentials: 'same-origin', ...opts, headers: { ...(opts.headers || {}) } };
    if (o.body && typeof o.body === 'object' && !(o.body instanceof Blob) && !(o.body instanceof ArrayBuffer)) {
      o.body = JSON.stringify(o.body); o.headers['content-type'] = 'application/json';
    }
    const res = await fetch(BASE + '/api/' + path.replace(/^\//, ''), o);
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (res.status === 401 && !path.startsWith('auth/') && !location.pathname.includes('/review')) {
      location.href = BASE + '/login?next=' + encodeURIComponent(location.pathname + location.search + location.hash);
      throw new Error('Sign in first.');
    }
    if (!res.ok) throw new Error((data && data.error) || 'Request failed (' + res.status + ').');
    return data;
  }
  const doc = {
    list: (scope, coll) => api(`db/${scope}/${coll}`).then((r) => r.docs),
    get: (scope, coll, id) => api(`db/${scope}/${coll}/${encodeURIComponent(id)}`).then((r) => r.data),
    put: (scope, coll, id, data) => api(`db/${scope}/${coll}/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
    del: (scope, coll, id) => api(`db/${scope}/${coll}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };
  async function upload(blob) {
    return api('files', { method: 'POST', body: blob, headers: { 'content-type': blob.type || 'image/png' } });
  }

  let tt;
  function toast(msg, ms = 2800) {
    let t = $('#pdToast');
    if (!t) { t = document.createElement('div'); t.id = 'pdToast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => (t.hidden = true), ms);
  }
  async function busy(btn, fn) {
    const html = btn.innerHTML; btn.disabled = true;
    btn.innerHTML = `<span class="spin${btn.classList.contains('primary') ? '' : ' dark'}"></span> ${esc(btn.dataset.busy || 'Working')}`;
    try { return await fn(); } catch (e) { toast(e.message || String(e), 4200); throw e; } finally { btn.disabled = false; btn.innerHTML = html; }
  }

  let me = null;
  async function header(active) {
    const h = document.createElement('header');
    h.className = 'top';
    const link = (href, label, key) => `<a href="${BASE}/${href}" ${active === key ? 'aria-current="page"' : ''}>${label}</a>`;
    h.innerHTML = `<a class="mark" href="${BASE}/">Path &amp; Pace</a><span class="app">Product Design</span>
      <nav aria-label="Main">${link('', 'Projects', 'projects')}${link('studio', 'Studio', 'studio')}${link('#/source', 'Source', 'source')}${link('#/settings', 'Costs', 'settings')}${link('#/team', 'Team', 'team')}</nav>
      <div class="spacer"></div><span class="who" id="pdWho"></span><button class="btn small ghost" id="pdOut">Sign out</button>`;
    document.body.prepend(h);
    $('#pdOut').onclick = async () => { await api('auth/logout', { method: 'POST' }).catch(() => {}); location.href = BASE + '/login'; };
    try { me = (await api('me')).user; $('#pdWho').textContent = me.name; } catch {}
    return me;
  }

  /* ---------- costs ---------- */
  const COSTS = { pressMarket: 2.665, markup: 25, floor: 10, pkg: 3.0, cardPct: 2.9, cardFixed: 0.3, duty: 36.5, sqin: 0.02614 };
  const COST_FIELDS = [
    ['pressMarket', 'Market rate per press', '$', '0.01', 'Average of six US press-only shops (Nov 2026)'],
    ['markup', 'Production markup on the rate', '%', '1', ''],
    ['floor', 'Production minimum per piece', '$', '0.5', ''],
    ['pkg', 'Packaging per unit', '$', '0.05', 'Mailer, tissue, card — still a guess'],
    ['sqin', 'Transfer cost per sq in', '$', '0.001', 'DTF gang sheet plus 15% waste'],
    ['duty', 'Duty on overseas blanks', '%', '0.5', ''],
    ['cardPct', 'Card fee', '%', '0.1', ''],
    ['cardFixed', 'Card fee per order', '$', '0.05', ''],
  ];
  async function costs() {
    try { const c = await doc.get('global', 'settings', 'costs'); return { ...COSTS, ...(c || {}) }; } catch { return { ...COSTS }; }
  }
  function costPiece(S, P, blankOverride) {
    const num = (v) => Number(v) || 0;
    const blank = blankOverride ?? num(P.blank);
    const duty = P.overseas ? r2(blank * S.duty / 100) : 0;
    const landed = r2(blank + num(P.freight) + duty);
    const transfer = r2(num(P.printSq) * S.sqin);
    const perPress = r2(S.pressMarket * (1 + S.markup / 100));
    const labor = r2(Math.max(S.floor, num(P.presses) * perPress));
    const cogs = r2(landed + transfer + labor + num(P.extras) + S.pkg);
    const price = num(P.price);
    const fees = r2(price * S.cardPct / 100 + S.cardFixed);
    const keep = r2(price - cogs - fees);
    return { blank, duty, landed, transfer, perPress, labor, cogs, fees, keep, pct: price ? Math.round(keep / price * 1000) / 10 : 0 };
  }
  // Highest blank price that still keeps `marginPct` at `retail`.
  function maxBlank(S, retail, marginPct, opts = {}) {
    const fees = retail * S.cardPct / 100 + S.cardFixed;
    const keepNeeded = retail * marginPct / 100;
    const labor = Math.max(S.floor, (opts.presses || 1) * S.pressMarket * (1 + S.markup / 100));
    const transfer = (opts.printSq ?? 36) * S.sqin;
    const rest = retail - fees - keepNeeded - labor - transfer - S.pkg - (opts.freight || 0);
    return r2(opts.overseas ? rest / (1 + S.duty / 100) : rest);
  }
  function launch(S, project) {
    const L = { run: 30, samplesOverseas: 0, samplesUS: 0, labels: 0, ...(project.launch || {}) };
    const pieces = (project.pieces || []).map((p) => ({ ...p, c: costPiece(S, p) }));
    const units = L.run * pieces.length;
    const make = r2(pieces.reduce((a, p) => a + p.c.cogs * L.run, 0));
    const rev = pieces.reduce((a, p) => a + (Number(p.price) || 0) * L.run, 0);
    const fees = r2(pieces.reduce((a, p) => a + p.c.fees * L.run, 0));
    const total = r2(make + Number(L.samplesOverseas) + Number(L.samplesUS) + Number(L.labels));
    const contrib = units ? (rev - fees) / units : 0;
    return { L, pieces, units, make, rev, fees, total, be: contrib > 0 ? Math.ceil(total / contrib) : Infinity, profit: r2(rev - fees - total) };
  }

  /* tiny, safe markdown for briefs */
  function md(s) {
    const lines = esc(s).split('\n'); let out = '', ul = false;
    const inline = (t) => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
    for (const ln of lines) {
      const m = ln.match(/^(#{1,3})\s+(.*)/), li = ln.match(/^\s*[-*]\s+(.*)/);
      if (li) { if (!ul) { out += '<ul>'; ul = true; } out += `<li>${inline(li[1])}</li>`; continue; }
      if (ul) { out += '</ul>'; ul = false; }
      if (m) out += `<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>`;
      else if (ln.trim()) out += `<p>${inline(ln)}</p>`;
    }
    return out + (ul ? '</ul>' : '');
  }

  return { BASE, $, $$, esc, uid, r2, usd, usd0, api, doc, upload, toast, busy, header, COSTS, COST_FIELDS, costs, costPiece, maxBlank, launch, md, get me() { return me; } };
})();

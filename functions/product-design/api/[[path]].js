// Path & Pace Product Design API. Everything except /auth/*, /review/* and GET /files/:id
// is already behind the session check in ../_middleware.js.
import {
  json, bad, sha256, randomHex, hashPassword, safeEqual, startSession, currentUser,
  sessionCookie, getCookie, COOKIE, cleanEmail, validEmail, strongEnough,
} from '../lib/core.js';
import { aiText, aiImage, aiSource, aiStatus } from '../lib/ai.js';

const MAX_FILE = 15 * 1024 * 1024;
const MAX_DOC = 900 * 1024;
const SCOPE_RE = /^[a-z0-9_-]{1,64}$/i;
const ID_RE = /^[a-z0-9_.-]{1,128}$/i;

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/product-design\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const m = request.method;
  try {
    const [a, b, c, d] = parts;
    if (a === 'auth') return await auth(b, request, env, url);
    if (a === 'review' && b) return await publicReview(b, c, request, env);
    if (a === 'files' && b && m === 'GET') return await getFile(b, env);

    const user = context.data.user || (await currentUser(request, env));
    if (!user) return bad('Sign in first.', 401);

    if (a === 'me') return json({ user });
    if (a === 'users') return await users(b, request, env, user, url);
    if (a === 'db') return await db(b, c, d, request, env, user, url);
    if (a === 'files' && b === 'fetch' && m === 'POST') return await fetchFile(request, env);
    if (a === 'files' && m === 'POST') return await putFile(request, env);
    if (a === 'reviews') return await reviews(b, request, env, user, url);
    if (a === 'ai') {
      if (b === 'status') return json(aiStatus(env));
      const body = await request.json().catch(() => ({}));
      if (b === 'text') return json(await aiText(env, body));
      if (b === 'image') return json(await aiImage(env, body));
      if (b === 'source') return json(await aiSource(env, body));
    }
    return bad('Not found.', 404);
  } catch (e) {
    const msg = e && e.expose ? e.message : 'Something went wrong on the server.';
    if (!(e && e.expose)) console.error(e && e.stack ? e.stack : e);
    return bad(msg, (e && e.status) || 500);
  }
}

// ---------- auth ----------
async function auth(action, request, env, url) {
  const m = request.method;
  const userCount = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n;

  if (action === 'state' && m === 'GET') {
    const user = await currentUser(request, env);
    return json({ needsSetup: (await userCount()) === 0, user });
  }
  if (action === 'invite' && m === 'GET') {
    const code = url.searchParams.get('code') || '';
    const row = await env.DB.prepare('SELECT email, name, expires FROM invites WHERE code_hash = ?').bind(await sha256(code)).first();
    if (!row || row.expires < Date.now()) return bad('This invite link has expired or was already used.', 404);
    return json({ email: row.email, name: row.name });
  }
  if (m !== 'POST') return bad('Not found.', 404);
  const body = await request.json().catch(() => ({}));

  if (action === 'setup') {
    if ((await userCount()) > 0) return bad('Setup is already done. Sign in instead.', 409);
    const stored = await env.DB.prepare("SELECT v FROM settings WHERE k = 'setup_code_sha256'").first();
    const given = await sha256(String(body.code || '').trim().toUpperCase());
    if (!stored || !safeEqual(stored.v, given)) return bad('That setup code is not right.', 403);
    const email = cleanEmail(body.email);
    const name = String(body.name || '').trim().slice(0, 80);
    if (!validEmail(email) || !name) return bad('Enter your name and email.');
    if (!strongEnough(body.password)) return bad('Use a password of at least 10 characters.');
    const { hash, salt } = await hashPassword(body.password);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users (email, name, role, pw_hash, salt, created) VALUES (?, ?, ?, ?, ?, ?)').bind(email, name, 'owner', hash, salt, Date.now()),
      env.DB.prepare("DELETE FROM settings WHERE k = 'setup_code_sha256'"),
    ]);
    return json({ ok: true }, 200, { 'set-cookie': await startSession(env, email) });
  }

  if (action === 'login') {
    const email = cleanEmail(body.email);
    const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    const fail = () => bad('Email or password is not right.', 401);
    if (!row) { await hashPassword(String(body.password || 'x')); return fail(); }
    if (row.locked_until > Date.now()) return bad('Too many tries. Wait 15 minutes and try again.', 429);
    const { hash } = await hashPassword(String(body.password || ''), row.salt);
    if (!safeEqual(hash, row.pw_hash)) {
      const fails = row.fails + 1;
      await env.DB.prepare('UPDATE users SET fails = ?, locked_until = ? WHERE email = ?')
        .bind(fails >= 5 ? 0 : fails, fails >= 5 ? Date.now() + 15 * 60e3 : 0, email).run();
      return fail();
    }
    await env.DB.prepare('UPDATE users SET fails = 0, locked_until = 0 WHERE email = ?').bind(email).run();
    return json({ ok: true }, 200, { 'set-cookie': await startSession(env, email) });
  }

  if (action === 'logout') {
    const token = getCookie(request, COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  }

  if (action === 'accept') {
    const ch = await sha256(String(body.code || ''));
    const inv = await env.DB.prepare('SELECT * FROM invites WHERE code_hash = ?').bind(ch).first();
    if (!inv || inv.expires < Date.now()) return bad('This invite link has expired or was already used.', 404);
    if (!strongEnough(body.password)) return bad('Use a password of at least 10 characters.');
    const { hash, salt } = await hashPassword(body.password);
    await env.DB.batch([
      env.DB.prepare('INSERT OR REPLACE INTO users (email, name, role, pw_hash, salt, created) VALUES (?, ?, ?, ?, ?, ?)').bind(inv.email, inv.name, inv.role, hash, salt, Date.now()),
      env.DB.prepare('DELETE FROM invites WHERE code_hash = ?').bind(ch),
    ]);
    return json({ ok: true }, 200, { 'set-cookie': await startSession(env, inv.email) });
  }

  if (action === 'password') {
    const user = await currentUser(request, env);
    if (!user) return bad('Sign in first.', 401);
    const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(user.email).first();
    const { hash } = await hashPassword(String(body.current || ''), row.salt);
    if (!safeEqual(hash, row.pw_hash)) return bad('Your current password is not right.', 403);
    if (!strongEnough(body.password)) return bad('Use a password of at least 10 characters.');
    const n = await hashPassword(body.password);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pw_hash = ?, salt = ? WHERE email = ?').bind(n.hash, n.salt, user.email),
      env.DB.prepare('DELETE FROM sessions WHERE email = ?').bind(user.email),
    ]);
    return json({ ok: true }, 200, { 'set-cookie': await startSession(env, user.email) });
  }
  return bad('Not found.', 404);
}

// ---------- team ----------
async function users(sub, request, env, user, url) {
  const m = request.method;
  const isOwner = user.role === 'owner';
  if (!sub && m === 'GET') {
    const r = await env.DB.prepare('SELECT email, name, role, created FROM users ORDER BY created').all();
    const inv = isOwner ? (await env.DB.prepare('SELECT email, name, role, expires FROM invites WHERE expires > ? ORDER BY expires').bind(Date.now()).all()).results : [];
    return json({ users: r.results, invites: inv });
  }
  if (!isOwner) return bad('Only the owner can change the team.', 403);
  if (sub === 'invite' && m === 'POST') {
    const body = await request.json().catch(() => ({}));
    const email = cleanEmail(body.email);
    const name = String(body.name || '').trim().slice(0, 80);
    const role = body.role === 'owner' ? 'owner' : 'member';
    if (!validEmail(email) || !name) return bad('Enter a name and email.');
    const code = randomHex(20);
    await env.DB.prepare('DELETE FROM invites WHERE email = ?').bind(email).run();
    await env.DB.prepare('INSERT INTO invites (code_hash, email, name, role, created_by, expires) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(await sha256(code), email, name, role, user.email, Date.now() + 7 * 864e5).run();
    return json({ link: `${url.origin}/product-design/login?invite=${code}`, expiresDays: 7 });
  }
  if (sub && m === 'DELETE') {
    const email = cleanEmail(sub);
    if (email === user.email) return bad('You cannot remove yourself.');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM users WHERE email = ?').bind(email),
      env.DB.prepare('DELETE FROM sessions WHERE email = ?').bind(email),
      env.DB.prepare('DELETE FROM invites WHERE email = ?').bind(email),
    ]);
    return json({ ok: true });
  }
  return bad('Not found.', 404);
}

// ---------- documents ----------
async function db(scope, coll, id, request, env, user, url) {
  if (!scope || !coll || !SCOPE_RE.test(scope) || !SCOPE_RE.test(coll)) return bad('Bad path.');
  const m = request.method;
  if (!id && m === 'GET') {
    const since = Number(url.searchParams.get('since') || 0);
    const r = await env.DB.prepare('SELECT id, data, updated, updated_by FROM docs WHERE scope = ? AND coll = ? AND updated > ? ORDER BY updated')
      .bind(scope, coll, since).all();
    const del = await env.DB.prepare("SELECT id, updated FROM docs WHERE scope = ? AND coll = ? AND updated > ? AND data = 'null'")
      .bind(scope, '_deleted_' + coll, since).all();
    return json({
      docs: r.results.map((x) => ({ id: x.id, data: JSON.parse(x.data), updated: x.updated, by: x.updated_by })),
      deleted: del.results.map((x) => x.id),
      now: Date.now(),
    });
  }
  if (!id || !ID_RE.test(id)) return bad('Bad id.');
  if (m === 'GET') {
    const x = await env.DB.prepare('SELECT data, updated FROM docs WHERE scope = ? AND coll = ? AND id = ?').bind(scope, coll, id).first();
    return json(x ? { id, data: JSON.parse(x.data), updated: x.updated } : { id, data: null });
  }
  if (m === 'PUT') {
    const text = await request.text();
    if (text.length > MAX_DOC) return bad('That is too big to save in one piece.', 413);
    let data;
    try { data = JSON.parse(text); } catch { return bad('Bad JSON.'); }
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('INSERT OR REPLACE INTO docs (scope, coll, id, data, updated, updated_by) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(scope, coll, id, JSON.stringify(data), now, user.email),
      env.DB.prepare('DELETE FROM docs WHERE scope = ? AND coll = ? AND id = ?').bind(scope, '_deleted_' + coll, id),
    ]);
    return json({ ok: true, updated: now });
  }
  if (m === 'DELETE') {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM docs WHERE scope = ? AND coll = ? AND id = ?').bind(scope, coll, id),
      env.DB.prepare("INSERT OR REPLACE INTO docs (scope, coll, id, data, updated, updated_by) VALUES (?, ?, ?, 'null', ?, ?)")
        .bind(scope, '_deleted_' + coll, id, now, user.email),
    ]);
    return json({ ok: true });
  }
  return bad('Not found.', 404);
}

// ---------- files ----------
async function putFile(request, env) {
  if (!env.FILES) return bad('File storage is not configured.', 503);
  const type = (request.headers.get('content-type') || 'application/octet-stream').split(';')[0];
  if (!/^(image\/(png|jpeg|webp|gif|svg\+xml)|application\/pdf)$/.test(type)) return bad('Images or PDFs only.', 415);
  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return bad('Empty file.');
  if (buf.byteLength > MAX_FILE) return bad('Files must be under 15 MB.', 413);
  const id = randomHex(24);
  await env.FILES.put(id, buf, { metadata: { type } });
  return json({ id, url: `/product-design/api/files/${id}` });
}
// Copy a supplier's product photo into our storage so the studio can draw on it.
async function fetchFile(request, env) {
  if (!env.FILES) return bad('File storage is not configured.', 503);
  const body = await request.json().catch(() => ({}));
  let u;
  try { u = new URL(String(body.url || '')); } catch { return bad('Bad image link.'); }
  if (!/^https?:$/.test(u.protocol)) return bad('Bad image link.');
  const res = await fetch(u.toString(), { headers: { 'user-agent': 'PathAndPace-ProductDesign/1.0', accept: 'image/*' }, redirect: 'follow' });
  const type = (res.headers.get('content-type') || '').split(';')[0];
  if (!res.ok || !/^image\/(png|jpeg|webp|gif)$/.test(type)) return bad('That link did not return a photo.', 422);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_FILE) return bad('That photo is too big.', 413);
  const id = randomHex(24);
  await env.FILES.put(id, buf, { metadata: { type } });
  return json({ id, url: `/product-design/api/files/${id}` });
}
async function getFile(id, env) {
  if (!env.FILES || !/^[a-f0-9]{24,64}$/i.test(id)) return bad('Not found.', 404);
  const r = await env.FILES.getWithMetadata(id, { type: 'arrayBuffer' });
  if (!r || !r.value) return bad('Not found.', 404);
  const type = (r.metadata && r.metadata.type) || 'application/octet-stream';
  const headers = { 'content-type': type, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' };
  if (type === 'image/svg+xml') headers['content-security-policy'] = "default-src 'none'; style-src 'unsafe-inline'";
  return new Response(r.value, { headers });
}

// ---------- client review links ----------
async function reviews(sub, request, env, user, url) {
  const m = request.method;
  if (m === 'POST' && !sub) {
    const body = await request.json().catch(() => ({}));
    const pid = String(body.projectId || '');
    if (!ID_RE.test(pid)) return bad('Pick a project.');
    const token = randomHex(20);
    await env.DB.prepare('INSERT INTO reviews (token_hash, project_id, created_by, created) VALUES (?, ?, ?, ?)')
      .bind(await sha256(token), pid, user.email, Date.now()).run();
    return json({ link: `${url.origin}/product-design/review?t=${token}` });
  }
  if (m === 'POST' && sub === 'revoke') {
    const body = await request.json().catch(() => ({}));
    await env.DB.prepare('UPDATE reviews SET revoked = 1 WHERE project_id = ?').bind(String(body.projectId || '')).run();
    return json({ ok: true });
  }
  return bad('Not found.', 404);
}

async function publicReview(token, action, request, env) {
  if (!/^[a-f0-9]{40}$/.test(token)) return bad('This link is not valid.', 404);
  const rv = await env.DB.prepare('SELECT * FROM reviews WHERE token_hash = ?').bind(await sha256(token)).first();
  if (!rv || rv.revoked) return bad('This review link was turned off. Ask for a new one.', 404);
  const p = await env.DB.prepare("SELECT data FROM docs WHERE scope = 'global' AND coll = 'projects' AND id = ?").bind(rv.project_id).first();
  if (!p) return bad('This project is gone.', 404);
  const project = JSON.parse(p.data);
  if (request.method === 'GET') {
    const fb = await env.DB.prepare("SELECT id, data FROM docs WHERE scope = ? AND coll = 'feedback'").bind(rv.project_id).all();
    return json({
      project: {
        name: project.name, brand: project.brand, owner: project.owner, version: project.version || 1,
        pieces: (project.pieces || []).map((x) => ({
          id: x.id, n: x.n, name: x.name, garment: x.garment, color: x.color, price: x.price,
          story: x.storyLine || '', image: x.reviewImage || (x.concepts && x.concepts[x.chosen || 0]) || x.image || '',
        })),
      },
      feedback: fb.results.map((r) => JSON.parse(r.data)),
    });
  }
  if (request.method === 'POST' && action === 'feedback') {
    const body = await request.json().catch(() => ({}));
    const pieceId = String(body.pieceId || '');
    if (!(project.pieces || []).some((x) => x.id === pieceId)) return bad('Pick a piece.');
    const status = body.status === 'approved' ? 'approved' : 'changes';
    const note = String(body.note || '').slice(0, 2000);
    const rec = { pieceId, status, note, version: project.version || 1, by: project.owner && project.owner.name ? project.owner.name : 'Client', at: Date.now() };
    await env.DB.prepare('INSERT OR REPLACE INTO docs (scope, coll, id, data, updated, updated_by) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(rv.project_id, 'feedback', pieceId, JSON.stringify(rec), Date.now(), 'review-link').run();
    return json({ ok: true, record: rec });
  }
  return bad('Not found.', 404);
}

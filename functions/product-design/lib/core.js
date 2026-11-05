// Shared helpers for Path & Pace Product Design. No route handlers live here.

export const COOKIE = 'ppd_session';
export const SESSION_DAYS = 30;
const enc = new TextEncoder();

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
export const bad = (msg, status = 400) => json({ error: msg }, status);

export function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function randomHex(bytes = 24) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return hex(a);
}
export async function sha256(s) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}
export async function hashPassword(password, saltHex) {
  const salt = saltHex || randomHex(16);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 },
    key,
    256
  );
  return { hash: hex(bits), salt };
}
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export function getCookie(request, name) {
  const h = request.headers.get('cookie') || '';
  for (const part of h.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}
export function sessionCookie(token, maxAgeSec) {
  return `${COOKIE}=${token}; Path=/product-design; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

// Returns { email, name, role } or null.
export async function currentUser(request, env) {
  const token = getCookie(request, COOKIE);
  if (!token || !env.DB) return null;
  const th = await sha256(token);
  const row = await env.DB.prepare(
    'SELECT u.email, u.name, u.role, s.expires FROM sessions s JOIN users u ON u.email = s.email WHERE s.token_hash = ?'
  ).bind(th).first();
  if (!row || row.expires < Date.now()) return null;
  return { email: row.email, name: row.name, role: row.role };
}

export async function startSession(env, email) {
  const token = randomHex(32);
  const expires = Date.now() + SESSION_DAYS * 864e5;
  await env.DB.prepare('INSERT INTO sessions (token_hash, email, expires) VALUES (?, ?, ?)')
    .bind(await sha256(token), email, expires).run();
  // Housekeeping: drop expired sessions.
  await env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(Date.now()).run();
  return sessionCookie(token, SESSION_DAYS * 86400);
}

export const cleanEmail = (e) => String(e || '').trim().toLowerCase();
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const strongEnough = (p) => typeof p === 'string' && p.length >= 10;

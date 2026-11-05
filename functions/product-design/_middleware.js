// Lock for everything under /product-design. Pages and files are only served to a
// signed-in member. The login splash, its assets, the client review link and the
// auth endpoints stay open so people can actually get in.
import { currentUser, json } from './lib/core.js';

const OPEN = [
  /^\/product-design\/login(\.html)?$/i,
  /^\/product-design\/review(\.html)?$/i,
  /^\/product-design\/assets\//i,
  /^\/product-design\/api\/auth\//i,
  /^\/product-design\/api\/review\//i,
];
const OPEN_GET = [/^\/product-design\/api\/files\/[a-f0-9]{24,64}$/i];

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const secure = (res) => {
    const r = new Response(res.body, res);
    r.headers.set('X-Frame-Options', 'SAMEORIGIN');
    r.headers.set('Referrer-Policy', 'same-origin');
    r.headers.set('X-Content-Type-Options', 'nosniff');
    if (!/\/api\/files\//.test(path) && !/\.(jpg|png|webp|css|js|woff2?)$/i.test(path)) r.headers.set('Cache-Control', 'no-store');
    return r;
  };

  if (OPEN.some((re) => re.test(path)) || (request.method === 'GET' && OPEN_GET.some((re) => re.test(path)))) {
    return secure(await next());
  }

  if (!env.DB) {
    return new Response('Product Design is not configured yet (database binding missing).', { status: 503 });
  }

  const user = await currentUser(request, env);
  if (!user) {
    if (path.startsWith('/product-design/api/')) return json({ error: 'Sign in first.' }, 401);
    const dest = path + url.search;
    return Response.redirect(`${url.origin}/product-design/login?next=${encodeURIComponent(dest)}`, 302);
  }
  context.data.user = user;
  return secure(await next());
}

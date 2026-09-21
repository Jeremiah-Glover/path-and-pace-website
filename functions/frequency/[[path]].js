// The Frequency portal, served at pathandpace.com/frequency.
//
// The portal is its own Cloudflare Pages project, deployed from the Frequency
// repo so its tests gate it. This function owns one path on this site and hands
// those requests to it; every other path on pathandpace.com is untouched.
//
// The portal is built with Next's `basePath: '/frequency'`, so the URLs it
// writes already carry the prefix — but its *files* sit at the root of that
// project (out/index.html, out/house/pod.html). So the prefix is stripped on
// the way out and left alone in the HTML, which is what keeps `_next/**`
// resolving on the way back in.
//
// Repointing the portal is one line: change PORTAL_ORIGIN, or set a
// FREQUENCY_PORTAL_ORIGIN environment variable on the Pages project.
const PORTAL_ORIGIN = 'https://frequency-portal.pages.dev';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const origin = env.FREQUENCY_PORTAL_ORIGIN || PORTAL_ORIGIN;

  // '/frequency' and '/frequency/foo' both lose the prefix; a bare
  // '/frequency' becomes '/', which the portal serves as its index.
  const path = url.pathname.slice('/frequency'.length) || '/';
  const target = new URL(path + url.search, origin);

  // Forward the original request rather than building a new one, so method,
  // headers and body survive. The portal is read-only today, but a proxy that
  // silently drops POSTs is a trap for whoever adds the first one.
  const upstream = new Request(target, request);
  upstream.headers.set('X-Forwarded-Host', url.host);

  const response = await fetch(upstream);

  // Content-hashed assets can be cached hard; HTML must not be, or a portal
  // deploy takes an hour to become visible here.
  const headers = new Headers(response.headers);
  if (path.startsWith('/_next/static/')) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (headers.get('content-type')?.includes('text/html')) {
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

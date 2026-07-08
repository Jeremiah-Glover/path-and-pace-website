// Case-insensitive canonical URL for the Boss Up privacy policy.
// Any casing of the policy path (or the legacy /privacy-policy path) is
// permanently redirected to the proper-case canonical below. Everything else
// falls straight through to normal static serving. Written defensively: any
// unexpected error just calls next(), so this can never take the site down.

const CANONICAL = '/BossUpTheApp-Privacy-Policy';
const CANONICAL_LC = CANONICAL.toLowerCase();
const ALIASES = new Set(['/privacy-policy']); // legacy path, matched case-insensitively

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const path = url.pathname.replace(/\.html$/i, '');
    const lower = path.toLowerCase();

    if (lower === CANONICAL_LC || ALIASES.has(lower)) {
      if (path !== CANONICAL) {
        url.pathname = CANONICAL;
        return Response.redirect(url.toString(), 301);
      }
    }
  } catch (_) {
    // fall through to normal serving
  }
  return context.next();
}

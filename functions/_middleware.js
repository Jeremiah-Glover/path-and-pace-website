// Case-insensitive canonical URLs. Any casing of a known page path (and a few
// legacy aliases) is permanently redirected (301) to its proper-case canonical.
// Everything else falls straight through to normal static serving. Written
// defensively: any unexpected error just calls next(), so this can never take
// the site down.

const CANONICALS = [
  '/BossUpTheApp-Privacy-Policy',
  '/bossupapp-delete-account',
];
// legacy/alternate path -> canonical target (matched case-insensitively)
const ALIASES = {
  '/privacy-policy': '/BossUpTheApp-Privacy-Policy',
};

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const path = url.pathname.replace(/\.html$/i, '');
    const lower = path.toLowerCase();

    let target = null;
    for (const c of CANONICALS) {
      if (lower === c.toLowerCase()) { target = c; break; }
    }
    if (!target && ALIASES[lower]) target = ALIASES[lower];

    if (target && path !== target) {
      url.pathname = target;
      return Response.redirect(url.toString(), 301);
    }
  } catch (_) {
    // fall through to normal serving
  }
  return context.next();
}

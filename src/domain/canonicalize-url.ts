/**
 * Conservative URL canonicalisation for deduplication.
 *
 * Applied: lower-case scheme/host (URL does this), default port removed,
 * fragment removed, a short list of well-known tracking parameters removed,
 * empty query removed. NOT applied (would risk merging distinct pages):
 * path case changes, `www.` stripping, query sorting, trailing-slash
 * changes, following redirects.
 */
export const CANONICALIZATION_VERSION = '1';

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'igshid',
  'yclid',
]);

export function isTrackingParam(name: string): boolean {
  const n = name.toLowerCase();
  return n.startsWith('utm_') || TRACKING_PARAMS.has(n);
}

/** Returns null for anything that is not an absolute http(s) URL. */
export function canonicalizeUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = '';
  url.username = '';
  url.password = '';
  const kept = [...url.searchParams.entries()].filter(([k]) => !isTrackingParam(k));
  url.search = '';
  for (const [k, v] of kept) url.searchParams.append(k, v);
  return url.href;
}

/** Resolves a possibly relative link against a base; null if not http(s). */
export function resolveLink(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

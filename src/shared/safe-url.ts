/**
 * URL guards used before any network request or any outbound link.
 */

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Feed URLs must be absolute https: URLs without credentials. */
export function checkFeedUrl(input: string): UrlCheck {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'URL vide.' };
  if (trimmed.length > 4096) return { ok: false, reason: 'URL trop longue.' };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'URL invalide.' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'Seules les URL https: sont acceptées.' };
  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'Les identifiants dans l’URL ne sont pas acceptés.' };
  }
  if (url.hostname === '' || !url.hostname.includes('.')) {
    return { ok: false, reason: 'Nom d’hôte invalide.' };
  }
  return { ok: true, url };
}

/** Links opened for the user: http(s) only, never javascript:, data:, file:, etc. */
export function safeOutboundUrl(input: string | undefined): string | null {
  if (input === undefined) return null;
  try {
    const url = new URL(input);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** `https://example.com/*` match pattern for chrome.permissions. */
export function originPattern(url: URL): string {
  return `${url.protocol}//${url.host}/*`;
}

/**
 * Untrusted text handling. Titles and excerpts from feeds may contain HTML or
 * entities. They are converted to plain text with an inert parser (a
 * DOMParser document has no browsing context: scripts never run, resources
 * are never fetched) and are only ever rendered as React text nodes.
 */

export const MAX_TITLE_LENGTH = 300;
export const MAX_EXCERPT_LENGTH = 400;

export function htmlToText(html: string): string {
  if (!/[<&]/.test(html)) return collapse(html);
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  // Drop non-content elements before reading text.
  for (const el of doc.querySelectorAll('script,style,noscript,template,iframe,object')) el.remove();
  return collapse(doc.body.textContent ?? '');
}

export function collapse(s: string): string {
  return (
    s
      // Deliberately strips ASCII control characters from untrusted feed text.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

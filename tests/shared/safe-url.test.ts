import { describe, expect, it } from 'vitest';
import { checkFeedUrl, originPattern, safeOutboundUrl } from '../../src/shared/safe-url';

describe('checkFeedUrl', () => {
  it('accepts https URLs', () => {
    const r = checkFeedUrl('  https://Example.ORG/feed.xml ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url.host).toBe('example.org');
  });

  it.each([
    ['http://example.org/feed', 'https'],
    ['javascript:alert(1)', 'https'],
    ['data:text/xml,<rss/>', 'https'],
    ['file:///etc/passwd', 'https'],
    ['https://user:pw@example.org/feed', 'identifiants'],
    ['https://localhost/feed', 'hôte'],
    ['not a url', 'invalide'],
    ['', 'vide'],
  ])('rejects %s', (input, reasonPart) => {
    const r = checkFeedUrl(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.toLowerCase()).toContain(reasonPart);
  });
});

describe('safeOutboundUrl', () => {
  it('allows http and https only', () => {
    expect(safeOutboundUrl('https://example.org/a')).toBe('https://example.org/a');
    expect(safeOutboundUrl('http://example.org/a')).toBe('http://example.org/a');
    expect(safeOutboundUrl('javascript:alert(1)')).toBeNull();
    expect(safeOutboundUrl('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeOutboundUrl('data:text/html,x')).toBeNull();
    expect(safeOutboundUrl('/relative')).toBeNull();
    expect(safeOutboundUrl(undefined)).toBeNull();
  });
});

describe('originPattern', () => {
  it('builds a per-origin match pattern', () => {
    expect(originPattern(new URL('https://blog.example.org:8443/feed?x=1'))).toBe('https://blog.example.org:8443/*');
  });
});

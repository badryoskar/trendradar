import { describe, expect, it } from 'vitest';
import { canonicalizeUrl, resolveLink } from '../../src/domain/canonicalize-url';
import { parseFeedDate, unixToIso } from '../../src/domain/dates';
import { htmlToText, truncate } from '../../src/domain/text';

const NOW = new Date('2026-11-12T12:00:00Z');

describe('parseFeedDate', () => {
  it.each([
    ['Tue, 10 Nov 2026 14:30:00 -0500', '2026-11-10T19:30:00.000Z'],
    ['10 Nov 2026 14:30:00 GMT', '2026-11-10T14:30:00.000Z'],
    ['Tue, 10 Nov 2026 14:30 EST', '2026-11-10T19:30:00.000Z'],
    ['Sun, 01 Nov 26 01:30:00 EDT', '2026-11-01T05:30:00.000Z'],
    ['2026-11-09T08:00:00+01:00', '2026-11-09T07:00:00.000Z'],
    ['2026-11-09T08:00:00.123Z', '2026-11-09T08:00:00.000Z'],
    ['2026-11-09 08:00:00Z', '2026-11-09T08:00:00.000Z'],
  ])('parses %s', (raw, iso) => {
    expect(parseFeedDate(raw, NOW)).toEqual({ iso });
  });

  it.each([
    ['2026-11-09', 'date-no-time'],
    ['2026-11-09T08:00:00', 'date-no-timezone'],
    ['Tue, 10 Nov 2026 14:30:00', 'date-no-timezone'],
    ['Tue, 10 Nov 2026 14:30:00 XYZ', 'date-unknown-timezone'],
    ['30 Feb 2026 10:00:00 GMT', 'date-unparseable'],
    ['2030-01-01T00:00:00Z', 'date-in-future'],
    ['1970-01-01T00:00:00Z', 'date-implausible'],
    ['yesterday', 'date-unparseable'],
  ])('refuses to guess for %s (%s)', (raw, warning) => {
    expect(parseFeedDate(raw, NOW)).toEqual({ warning });
  });

  it('treats empty values as absent', () => {
    expect(parseFeedDate('  ', NOW)).toBeUndefined();
    expect(parseFeedDate(undefined, NOW)).toBeUndefined();
  });

  it('converts HN unix times', () => {
    expect(unixToIso(1_794_000_000, NOW)).toEqual({ iso: '2026-11-06T21:20:00.000Z' });
    expect(unixToIso(4_000_000_000, NOW)).toEqual({ warning: 'date-in-future' });
  });
});

describe('canonicalizeUrl', () => {
  it('removes fragments, tracking parameters, default port and host case', () => {
    expect(canonicalizeUrl('HTTPS://Blog.Example.org:443/Post?utm_source=rss&id=42&fbclid=abc#comments')).toBe(
      'https://blog.example.org/Post?id=42',
    );
  });
  it('keeps semantic parameters, their order, path case and trailing slashes', () => {
    expect(canonicalizeUrl('https://example.org/a/?b=2&a=1&page=3')).toBe('https://example.org/a/?b=2&a=1&page=3');
    expect(canonicalizeUrl('https://example.org/a')).not.toBe(canonicalizeUrl('https://example.org/a/'));
    expect(canonicalizeUrl('https://www.example.org/a')).not.toBe(canonicalizeUrl('https://example.org/a'));
  });
  it('drops empty query and credentials, refuses non-http schemes', () => {
    expect(canonicalizeUrl('https://u:p@example.org/x?utm_medium=a')).toBe('https://example.org/x');
    expect(canonicalizeUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalizeUrl('not a url')).toBeNull();
  });
  it('resolves relative links against the feed URL', () => {
    expect(resolveLink('../b', 'https://example.org/x/feed.xml')).toBe('https://example.org/b');
    expect(resolveLink('data:text/html,x', 'https://example.org/')).toBeNull();
  });
});

describe('text sanitisation', () => {
  it('turns HTML into inert text', () => {
    expect(htmlToText('<p>Hello <script>alert(1)</script><b>world</b> &amp; co</p>')).toBe('Hello world & co');
    expect(htmlToText('<img src=x onerror=alert(1)>Title')).toBe('Title');
    expect(htmlToText('plain\n\n text')).toBe('plain text');
  });
  it('truncates on a word boundary with an ellipsis', () => {
    expect(truncate('one two three four five', 12)).toBe('one two…');
    expect(truncate('short', 12)).toBe('short');
  });
});

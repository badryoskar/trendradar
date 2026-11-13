import { describe, expect, it } from 'vitest';
import { parseFeed } from '../../src/connectors/feed-parser';
import { decode } from '../../src/connectors/network-client';
import { ConnectorError } from '../../src/shared/failures';
import { fixture, fixtureText } from '../net-helpers';

const NOW = new Date('2026-11-12T12:00:00Z');
const BASE = 'https://blog.example.org/feed.xml';

function parseCode(xml: string): string {
  try {
    parseFeed(xml, BASE, NOW, 50);
    return 'ok';
  } catch (e) {
    expect(e).toBeInstanceOf(ConnectorError);
    return (e as ConnectorError).code;
  }
}

describe('RSS 2.0', () => {
  const feed = parseFeed(fixtureText('rss/basic.xml'), BASE, NOW, 50);

  it('detects format and channel metadata', () => {
    expect(feed.format).toBe('rss2');
    expect(feed.title).toBe('Blog Exemple & Co');
    expect(feed.language).toBe('fr-ca');
  });

  it('skips items without title, without link or with a non-http link', () => {
    expect(feed.items.map((i) => i.title)).toEqual([
      'Sortie de PHP 8.5 : les nouveautés',
      'Billet sans date',
      'Date au format ISO dans dc:date',
      'Date illisible',
    ]);
    expect(feed.warnings).toEqual(expect.arrayContaining(['item-skipped:no-title', 'item-skipped:no-link']));
    expect(feed.warnings.filter((w) => w === 'item-skipped:no-link')).toHaveLength(2);
  });

  it('strips HTML from titles and excerpts, never keeps script text or full content', () => {
    const first = feed.items[0]!;
    expect(first.excerpt).toBe('Résumé court du billet.');
    expect(JSON.stringify(feed)).not.toContain('alert');
    expect(JSON.stringify(feed)).not.toContain('FULL ARTICLE BODY');
    expect(first.byline).toBe('Alice');
    expect(first.externalId).toBe('post-42');
  });

  it('converts RFC 822 dates with offsets to UTC', () => {
    expect(feed.items[0]!.publishedAt).toBe('2026-11-10T19:30:00.000Z');
  });

  it('keeps missing dates unknown and resolves relative links', () => {
    const noDate = feed.items[1]!;
    expect(noDate.publishedAt).toBeUndefined();
    expect(noDate.url).toBe('https://blog.example.org/relative/no-date');
  });

  it('reads dc:date ISO dates and reports unparseable ones', () => {
    expect(feed.items[2]!.publishedAt).toBe('2026-11-09T07:00:00.000Z');
    expect(feed.items[3]!.publishedAt).toBeUndefined();
    expect(feed.warnings).toContain('date-unparseable');
  });

  it('truncates to maxItems with a warning', () => {
    const small = parseFeed(fixtureText('rss/basic.xml'), BASE, NOW, 2);
    expect(small.items).toHaveLength(2);
    expect(small.warnings.some((w) => w.startsWith('items-truncated'))).toBe(true);
  });
});

describe('Atom 1.0', () => {
  const feed = parseFeed(fixtureText('atom/basic.xml'), 'https://news.example.org/atom.xml', NOW, 50);

  it('parses entries, xml:base and alternate links', () => {
    expect(feed.format).toBe('atom');
    expect(feed.title).toBe('Example News');
    expect(feed.language).toBe('en');
    expect(feed.items[0]).toMatchObject({
      externalId: 'urn:example:entry:1',
      title: 'Browser ships new CSS feature',
      url: 'https://news.example.org/2026/css-feature',
      publishedAt: '2026-11-11T09:00:00.000Z',
      updatedAt: '2026-11-11T09:30:00.000Z',
      excerpt: 'A short summary.',
      byline: 'Bob',
    });
    expect(JSON.stringify(feed)).not.toContain('FULL CONTENT');
  });

  it('keeps an update-only date as updatedAt, not publishedAt', () => {
    expect(feed.items[1]).toMatchObject({
      title: 'Only updated date',
      publishedAt: undefined,
      updatedAt: '2026-11-10T05:00:00.000Z',
    });
  });
});

describe('RSS 1.0 / encodings', () => {
  it('parses RDF feeds decoded from Latin-1', () => {
    const text = decode(new Uint8Array(fixture('rss/rdf.xml')), 'application/xml', 'xml');
    const feed = parseFeed(text, 'https://rdf.example.org/rss', NOW, 50);
    expect(feed.format).toBe('rss1');
    expect(feed.items[0]).toMatchObject({
      title: 'Café crème',
      url: 'https://rdf.example.org/a',
      publishedAt: '2026-11-08T12:00:00.000Z',
    });
  });
});

describe('hostile or invalid documents', () => {
  it('rejects entity declarations (XXE, billion laughs) before parsing', () => {
    expect(parseCode(fixtureText('rss/xxe.xml'))).toBe('parse');
  });
  it('rejects malformed XML', () => {
    expect(parseCode('<rss><channel><item></rss>')).toBe('parse');
  });
  it('rejects non-feed XML and HTML', () => {
    expect(parseCode('<?xml version="1.0"?><html><body/></html>')).toBe('parse');
    expect(parseCode('<sitemap/>')).toBe('parse');
  });
  it('rejects RSS without channel', () => {
    expect(parseCode('<rss version="2.0"/>')).toBe('parse');
  });
});

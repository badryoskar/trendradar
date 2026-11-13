import { describe, expect, it } from 'vitest';
import type { Article } from '../../src/domain/content.types';
import { clusterArticles, jaccard, similar, titleTokens } from '../../src/domain/topic-cluster';
import { makeArticle } from '../helpers';
import { fixtureText } from '../net-helpers';

const pairs = JSON.parse(fixtureText('timelines/title-pairs.json')) as {
  synthetic: boolean;
  shouldGroup: [string, string][];
  shouldNotGroup: [string, string][];
};

let n = 0;
function art(title: string, publishedAt: string, host = 'a.example.org', sourceId = 'src-a'): Article {
  n++;
  const url = `https://${host}/p${n}`;
  return makeArticle({
    id: `x${String(n).padStart(3, '0')}`,
    title,
    canonicalUrl: url,
    publishedAt,
    sourceIds: [sourceId],
    provenance: [{ sourceId, originalUrl: url, firstSeenAt: publishedAt, lastSeenAt: publishedAt }],
    firstSeenAt: publishedAt,
    lastSeenAt: publishedAt,
    fetchedAt: publishedAt,
  });
}

describe('tokenisation', () => {
  it('normalises, drops stopwords/short words, keeps versions, folds plurals', () => {
    expect(titleTokens('Les nouvelles failles de sécurité dans PHP 8.5 !')).toEqual(['faille', 'php', 'securite']);
    expect(titleTokens('Kubernetes 1.36 deprecates controllers')).toEqual([
      '36',
      'controller',
      'deprecate',
      'kubernete',
    ]);
    expect(titleTokens('the and of')).toEqual([]);
  });
  it('jaccard is symmetric and bounded', () => {
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
    expect(jaccard([], [])).toBe(0);
  });
});

describe('similarity rule v1 on synthetic calibration pairs', () => {
  it('fixtures are explicitly synthetic', () => {
    expect(pairs.synthetic).toBe(true);
  });
  it.each(pairs.shouldGroup)('groups: "%s" ~ "%s"', (a, b) => {
    expect(similar(titleTokens(a), titleTokens(b)).ok).toBe(true);
  });
  it.each(pairs.shouldNotGroup)('keeps apart: "%s" / "%s"', (a, b) => {
    expect(similar(titleTokens(a), titleTokens(b)).ok).toBe(false);
  });
});

describe('clusterArticles', () => {
  it('groups same-story titles across sources and labels with a real member title', () => {
    const a = art('PHP 8.5 released with pipe operator', '2026-11-10T10:00:00.000Z', 'php.example.org', 's1');
    const b = art(
      'PHP 8.5 released: pipe operator and new array functions',
      '2026-11-10T12:00:00.000Z',
      'news.example.net',
      's2',
    );
    const c = art('Mercury prices rise in industrial markets', '2026-11-10T13:00:00.000Z');
    const clusters = clusterArticles([c, b, a]);
    const php = clusters.find((x) => x.articleIds.length === 2)!;
    expect(php.articleIds.sort()).toEqual([a.id, b.id].sort());
    expect([a.title, b.title]).toContain(php.label);
    expect(php.distinctOrigins).toEqual(['news.example.net', 'php.example.org']);
    expect(php.distinctSourceIds).toEqual(['s1', 's2']);
    expect(php.sharedTerms).toEqual(['operator', 'pipe', 'released']);
    expect(php.firstObservedAt).toBe('2026-11-10T10:00:00.000Z');
    expect(clusters).toHaveLength(2);
  });

  it('is independent of input order', () => {
    const items = [
      art('Firefox 150 ships CSS masonry layout', '2026-11-10T10:00:00.000Z'),
      art('Firefox 150 ships masonry layout in CSS', '2026-11-10T11:00:00.000Z'),
      art('Chrome 150 ships masonry layout too', '2026-11-10T12:00:00.000Z'),
      art('Rust 1.95 stabilise les closures asynchrones', '2026-11-10T09:00:00.000Z'),
      art('Rust 1.95 : les closures asynchrones stabilisées', '2026-11-11T09:00:00.000Z'),
    ];
    const norm = (cs: ReturnType<typeof clusterArticles>) => cs.map((c) => [...c.articleIds].sort().join(',')).sort();
    const ref = norm(clusterArticles(items));
    expect(norm(clusterArticles([...items].reverse()))).toEqual(ref);
    expect(norm(clusterArticles([items[2]!, items[0]!, items[4]!, items[1]!, items[3]!]))).toEqual(ref);
  });

  it('does not build giant clusters out of generic terms', () => {
    const generic = [
      'Google AI update released today',
      'Microsoft AI update released',
      'OpenAI update released for AI apps',
      'Meta AI news update',
      'Apple AI release news',
    ].map((t, i) => art(t, `2026-11-10T1${i}:00:00.000Z`));
    expect(clusterArticles(generic).every((c) => c.articleIds.length === 1)).toBe(true);
  });

  it('anchors on the seed: a chain of drifting titles does not merge', () => {
    const chain = [
      art('OpenSSL critical vulnerability patched today', '2026-11-10T10:00:00.000Z'),
      art('OpenSSL critical vulnerability patched, exploited', '2026-11-10T11:00:00.000Z'),
      // Similar to the 2nd title (J=0.67) but not to the seed (J=0.43):
      // single-link would merge all three, seed anchoring does not.
      art('Critical OpenSSL vulnerability exploited by ransomware', '2026-11-10T12:00:00.000Z'),
    ];
    const [a, b, c] = chain.map((x) => titleTokens(x.title));
    expect(similar(c!, b!).ok).toBe(true);
    expect(similar(c!, a!).ok).toBe(false);
    const sizes = clusterArticles(chain)
      .map((c) => c.articleIds.length)
      .sort();
    expect(sizes).toEqual([1, 2]);
  });

  it('chains in time: a topic covered every two days stays one cluster; a gap > 72h splits it', () => {
    const t = 'Kubernetes 1.36 deprecates legacy ingress controller';
    const regular = ['2026-11-01', '2026-11-03', '2026-11-05', '2026-11-07'].map((d) => art(t, `${d}T10:00:00.000Z`));
    expect(clusterArticles(regular)).toHaveLength(1);
    const gap = [art(t, '2026-11-01T10:00:00.000Z'), art(t, '2026-11-05T11:00:00.000Z')];
    expect(clusterArticles(gap)).toHaveLength(2);
  });

  it('uses firstSeenAt as reference time for undated articles (clustering only)', () => {
    const a = art('Rust 1.95 stabilise les closures asynchrones', '2026-11-10T09:00:00.000Z');
    const { publishedAt: _d, ...b0 } = art(
      'Rust 1.95 : les closures asynchrones stabilisées',
      '2026-11-10T10:00:00.000Z',
    );
    const b = { ...b0, temporalQuality: 'unknown' as const };
    expect(clusterArticles([a, b])).toHaveLength(1);
  });

  it('an aggregator counts as a single origin', () => {
    const a = art(
      'Rust 1.95 stabilise les closures asynchrones',
      '2026-11-10T09:00:00.000Z',
      'blog1.example.org',
      'hacker-news',
    );
    const b = art(
      'Rust 1.95 : les closures asynchrones stabilisées',
      '2026-11-10T10:00:00.000Z',
      'blog2.example.org',
      'hacker-news',
    );
    expect(clusterArticles([a, b])[0]!.distinctOrigins).toEqual(['news.ycombinator.com']);
  });
});

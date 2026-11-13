/**
 * SYNTHETIC TIMELINES — all articles, sources and fetch attempts below are
 * fabricated test data with a pinned clock. They demonstrate the rules;
 * they are not evidence of any real-world trend.
 */
import { describe, expect, it } from 'vitest';
import type { Article, FetchAttempt, Source } from '../../src/domain/content.types';
import { analyzeTopics } from '../../src/domain/topics';
import { computeCoverage, computeSignal, intervalsCover, trendWindows } from '../../src/domain/trend-signal';
import { clusterArticles } from '../../src/domain/topic-cluster';
import { makeArticle, makeSource } from '../helpers';

const NOW = new Date('2026-11-12T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const feeds: Source[] = ['f1', 'f2', 'f3', 'f4'].map((id) =>
  makeSource({ id, name: id, origin: `https://${id}.example.org`, feedUrl: `https://${id}.example.org/rss` }),
);

/** A fetch at `endedHoursAgo` whose oldest item reaches back `depthHours` before that. */
function attempt(sourceId: string, endedHoursAgo: number, depthHours: number, success = true): FetchAttempt {
  return {
    sourceId,
    startedAt: hoursAgo(endedHoursAgo),
    endedAt: hoursAgo(endedHoursAgo),
    success,
    fetchedCount: 10,
    insertedCount: 0,
    oldestItemPublishedAt: hoursAgo(endedHoursAgo + depthHours),
  };
}

/** Full coverage: every feed fetched 1h ago with 8 days of depth. */
const fullCoverage = feeds.map((f) => attempt(f.id, 1, 8 * 24));

let n = 0;
function story(title: string, publishedHoursAgo: number | null, sourceId: string): Article {
  n++;
  const url = `https://${sourceId}.example.org/s${n}`;
  const seen = hoursAgo(Math.max(0, (publishedHoursAgo ?? 1) - 0.5));
  const base = makeArticle({
    id: `t${String(n).padStart(3, '0')}`,
    title,
    canonicalUrl: url,
    sourceIds: [sourceId],
    provenance: [{ sourceId, originalUrl: url, firstSeenAt: seen, lastSeenAt: seen }],
    firstSeenAt: seen,
    lastSeenAt: seen,
    fetchedAt: seen,
  });
  if (publishedHoursAgo === null) {
    const { publishedAt: _d, ...rest } = base;
    return { ...rest, temporalQuality: 'unknown' };
  }
  return { ...base, publishedAt: hoursAgo(publishedHoursAgo) };
}

const T = 'OpenSSL critical vulnerability CVE-2026-1234 patched';
const T2 = 'OpenSSL patches critical CVE-2026-1234 vulnerability';

function signalFor(articles: Article[], attempts: FetchAttempt[], sources = feeds) {
  const clusters = clusterArticles(articles).filter((c) => c.articleIds.length >= 2);
  expect(clusters).toHaveLength(1);
  return computeSignal(
    clusters[0]!,
    new Map(articles.map((a) => [a.id, a])),
    computeCoverage(attempts, sources, NOW),
    NOW,
  );
}

describe('coverage', () => {
  it('interval union', () => {
    expect(
      intervalsCover(
        [
          [0, 5],
          [4, 10],
        ],
        1,
        9,
      ),
    ).toBe(true);
    expect(
      intervalsCover(
        [
          [0, 5],
          [6, 10],
        ],
        1,
        9,
      ),
    ).toBe(false);
    expect(intervalsCover([], 1, 9)).toBe(false);
  });

  it('requires 3 feeds whose fetched items reach back to the window start', () => {
    expect(computeCoverage(fullCoverage, feeds, NOW)).toMatchObject({ recentCovered: true, baselineCovered: true });
    const shallow = feeds.map((f) => attempt(f.id, 1, 10)); // only 10h of depth
    expect(computeCoverage(shallow, feeds, NOW)).toMatchObject({ recentCovered: false, baselineCovered: false });
    const two = fullCoverage.slice(0, 2);
    expect(computeCoverage(two, feeds, NOW)).toMatchObject({ recentCovered: false, baselineCovered: false });
  });

  it('accumulates coverage from several manual refreshes over the week', () => {
    // Each feed refreshed daily with 30h of depth: union spans the whole week.
    const daily = feeds.flatMap((f) => [1, 25, 49, 73, 97, 121, 145, 169].map((h) => attempt(f.id, h, 30)));
    expect(computeCoverage(daily, feeds, NOW)).toMatchObject({ recentCovered: true, baselineCovered: true });
    // A two-day hole breaks baseline coverage.
    const holed = daily.filter((a) => a.endedAt !== hoursAgo(73) && a.endedAt !== hoursAgo(97));
    expect(computeCoverage(holed, feeds, NOW).baselineCovered).toBe(false);
  });

  it('ignores failed attempts, HN rankings and demo sources', () => {
    const hn = makeSource({
      id: 'hacker-news',
      kind: 'hacker-news',
      origin: 'https://hacker-news.firebaseio.com',
      feedUrl: 'https://hacker-news.firebaseio.com/v0/topstories.json',
    });
    const demo = makeSource({ id: 'demo', isDemo: true });
    const attempts = [
      attempt('f1', 1, 200),
      attempt('f2', 1, 200),
      attempt('f3', 1, 200, false),
      attempt('hacker-news', 1, 200),
      attempt('demo', 1, 200),
    ];
    const c = computeCoverage(attempts, [...feeds, hn, demo], NOW);
    expect(c.recentSources).toEqual(['f1', 'f2']);
    expect(c.recentCovered).toBe(false);
  });

  it('windows are 24h recent and 6 days baseline', () => {
    const w = trendWindows(NOW);
    expect(new Date(w.recent.start).toISOString()).toBe('2026-11-11T12:00:00.000Z');
    expect(new Date(w.baseline.start).toISOString()).toBe('2026-11-05T12:00:00.000Z');
  });
});

describe('signals', () => {
  it('no fetch history -> insufficient data, even with many articles', () => {
    const s = signalFor([story(T, 2, 'f1'), story(T2, 3, 'f2'), story(T, 4, 'f3'), story(T2, 5, 'f4')], []);
    expect(s.status).toBe('insufficient-data');
    expect(s.reasonCodes).toEqual(expect.arrayContaining(['recent-not-covered:0/3', 'baseline-not-covered:0/3']));
    expect(s.score).toBeUndefined();
  });

  it('covered, zero baseline, 3 recent articles from 3 origins -> emerging with documented ratio', () => {
    const s = signalFor([story(T, 2, 'f1'), story(T2, 3, 'f2'), story(T, 4, 'f3')], fullCoverage);
    expect(s.status).toBe('emerging');
    expect(s.recentWindow).toMatchObject({ count: 3, covered: true });
    expect(s.baselineWindow).toMatchObject({ count: 0, covered: true });
    expect(s.distinctOrigins).toBe(3);
    expect(s.score).toBe(18); // 3 / ((0 + 1) / 6)
  });

  it('a single source repeating itself is never emerging', () => {
    const s = signalFor([story(T, 2, 'f1'), story(T2, 3, 'f1'), story(T, 4, 'f1'), story(T2, 5, 'f1')], fullCoverage);
    expect(s.status).toBe('insufficient-data');
    expect(s.reasonCodes).toContain('too-few-recent-origins:1/3');
  });

  it('two articles a few hours apart are not a trend', () => {
    const s = signalFor([story(T, 2, 'f1'), story(T2, 3, 'f2')], fullCoverage);
    expect(s.status).toBe('insufficient-data');
    expect(s.reasonCodes).toContain('too-few-recent-articles:2/3');
  });

  it('steady coverage in the baseline keeps the ratio below threshold', () => {
    const arts = [
      story(T, 2, 'f1'),
      story(T2, 3, 'f2'),
      story(T, 4, 'f3'),
      // baseline: 5 articles over the previous 6 days
      story(T, 30, 'f1'),
      story(T2, 50, 'f2'),
      story(T, 70, 'f3'),
      story(T2, 90, 'f4'),
      story(T, 110, 'f1'),
    ];
    const s = signalFor(arts, fullCoverage);
    // 3 / ((5 + 1) / 6) = 3: the threshold is inclusive.
    expect(s.score).toBe(3);
    expect(s.status).toBe('emerging');
    const more = signalFor([...arts, story(T2, 120, 'f2'), story(T, 125, 'f3')], fullCoverage);
    expect(more.score).toBeCloseTo(2.25);
    expect(more.status).toBe('recurring');
    expect(more.reasonCodes).toEqual(expect.arrayContaining(['ratio-below-threshold:2.25<3']));
  });

  it('undated articles are excluded from window counts and reported', () => {
    const s = signalFor([story(T, 2, 'f1'), story(T2, null, 'f2'), story(T, null, 'f3')], fullCoverage);
    expect(s.recentWindow.count).toBe(1);
    expect(s.undatedArticles).toBe(2);
    expect(s.reasonCodes).toContain('undated-excluded:2');
    expect(s.status).toBe('insufficient-data');
  });

  it('articles dated outside both windows do not count', () => {
    const s = signalFor([story(T, 2, 'f1'), story(T2, 3, 'f2'), story(T, -30, 'f3')], fullCoverage); // one in the future
    expect(s.recentWindow.count).toBe(2);
  });

  it('recurring needs 3 distinct days and 2 origins; it does not need coverage', () => {
    const arts = [story(T, 10, 'f1'), story(T2, 34, 'f2'), story(T, 58, 'f1')];
    const s = signalFor(arts, []);
    expect(s.status).toBe('recurring');
    expect(s.reasonCodes[0]).toBe('recurring:days=3');
    const oneOrigin = signalFor([story(T, 10, 'f1'), story(T2, 34, 'f1'), story(T, 58, 'f1')], []);
    expect(oneOrigin.status).toBe('insufficient-data');
  });
});

describe('analyzeTopics', () => {
  it('only reports multi-article clusters from the last 14 days, emerging first', () => {
    const arts = [
      story(T, 2, 'f1'),
      story(T2, 3, 'f2'),
      story(T, 4, 'f3'),
      story('Rust 1.95 stabilise les closures asynchrones', 10, 'f1'),
      story('Rust 1.95 : les closures asynchrones stabilisées', 12, 'f4'),
      story('Lonely unrelated headline about gardening', 5, 'f2'),
      story('Firefox 150 ships CSS masonry layout', 20 * 24, 'f1'),
      story('Firefox 150 ships masonry layout in CSS', 20 * 24 + 1, 'f2'),
    ];
    const r = analyzeTopics(arts, fullCoverage, feeds, NOW);
    expect(r.topics.map((t) => t.signal.status)).toEqual(['emerging', 'insufficient-data']);
    expect(r.analysedArticles).toBe(6);
    expect(r.trendRuleVersion).toBe('1');
  });
});

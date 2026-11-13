/**
 * Performance budgets on SYNTHETIC data (2 000 generated articles, the
 * dashboard's in-memory maximum). Budgets are generous upper bounds for a
 * jsdom test runner; they guard against accidental quadratic blow-ups,
 * not micro-optimisations.
 */
import { describe, expect, it } from 'vitest';
import type { Article, FetchAttempt } from '../../src/domain/content.types';
import { defaultCategories } from '../../src/domain/default-categories';
import { DEFAULT_QUERY, runQuery } from '../../src/domain/query';
import { analyzeTopics } from '../../src/domain/topics';
import { ingestDrafts } from '../../src/persistence/ingest';
import { putSource } from '../../src/persistence/repositories';
import { MAX_LOADED_ARTICLES } from '../../src/ui/useDashboardData';
import { freshDb, makeArticle, makeSource } from '../helpers';

const NOW = new Date('2026-11-12T12:00:00.000Z');
const WORDS = [
  'php',
  'rust',
  'kernel',
  'release',
  'browser',
  'vulnerability',
  'startup',
  'funding',
  'design',
  'hiring',
  'compiler',
  'database',
  'quantum',
  'battery',
  'satellite',
  'privacy',
  'regulation',
  'payments',
  'plugin',
  'layout',
];

function generate(n: number): Article[] {
  const out: Article[] = [];
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed / 2 ** 31);
  for (let i = 0; i < n; i++) {
    const title = Array.from({ length: 7 }, () => WORDS[Math.floor(rnd() * WORDS.length)]).join(' ') + ` ${i % 97}`;
    const t = new Date(NOW.getTime() - Math.floor(rnd() * 14 * 86_400_000)).toISOString();
    const src = `s${i % 12}`;
    const url = `https://${src}.example.org/a${i}`;
    out.push(
      makeArticle({
        id: `p${i}`,
        title,
        canonicalUrl: url,
        publishedAt: t,
        sourceIds: [src],
        provenance: [{ sourceId: src, originalUrl: url, firstSeenAt: t, lastSeenAt: t }],
        firstSeenAt: t,
        lastSeenAt: t,
        fetchedAt: t,
      }),
    );
  }
  return out;
}

function time(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('performance budgets (synthetic 2 000 articles)', () => {
  const articles = generate(MAX_LOADED_ARTICLES);

  it('search + filters + classification + sort < 500 ms', () => {
    const ctx = {
      now: NOW,
      timeZone: 'America/Toronto',
      categories: defaultCategories(),
      sourcesById: new Map(),
      userStates: new Map(),
    };
    const ms = time(() =>
      runQuery(
        articles,
        { ...DEFAULT_QUERY, text: 'rust kernel', published: 'last7days', sort: 'published-desc' },
        ctx,
      ),
    );
    expect(ms).toBeLessThan(500);
  });

  it('topic clustering + signals < 3 000 ms', () => {
    const attempts: FetchAttempt[] = [];
    let r: ReturnType<typeof analyzeTopics> | undefined;
    const ms = time(() => (r = analyzeTopics(articles, attempts, [], NOW)));
    expect(r!.analysedArticles).toBe(MAX_LOADED_ARTICLES);
    expect(ms).toBeLessThan(3000);
  });

  it('ingesting 500 drafts in one transaction < 3 000 ms, replay is idempotent', async () => {
    const db = await freshDb();
    const source = makeSource();
    await putSource(db, source);
    const drafts = articles
      .slice(0, 500)
      .map((a) => ({ externalId: a.id, title: a.title, url: a.canonicalUrl, publishedAt: a.publishedAt! }));
    const start = performance.now();
    const first = await ingestDrafts(db, source, drafts, NOW.toISOString());
    const ms = performance.now() - start;
    const again = await ingestDrafts(db, source, drafts, NOW.toISOString());
    expect(first.inserted).toBe(500);
    expect(again.inserted).toBe(0);
    expect(ms).toBeLessThan(3000);
  });
});

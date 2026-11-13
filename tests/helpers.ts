import type { Article, Source } from '../src/domain/content.types';
import { openTrendRadarDb, type DB } from '../src/persistence/db';

let counter = 0;
/** Each test gets its own fake IndexedDB database. */
export async function freshDb(): Promise<DB> {
  counter++;
  return openTrendRadarDb({ name: `test-${counter}-${Math.random().toString(36).slice(2)}` });
}

export function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: 'src-a',
    kind: 'feed',
    name: 'Source A',
    origin: 'https://a.example.org',
    feedUrl: 'https://a.example.org/feed.xml',
    enabled: true,
    health: 'never-fetched',
    attributionUrl: 'https://a.example.org/',
    categoryIds: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    consecutiveFailures: 0,
    ...overrides,
  };
}

export function makeArticle(overrides: Partial<Article> = {}): Article {
  const url = overrides.canonicalUrl ?? 'https://a.example.org/post-1';
  const seen = overrides.firstSeenAt ?? '2026-11-10T12:00:00.000Z';
  return {
    id: 'art-1',
    title: 'Un article de test',
    canonicalUrl: url,
    provenance: [{ sourceId: 'src-a', externalId: 'guid-1', originalUrl: url, firstSeenAt: seen, lastSeenAt: seen }],
    sourceIds: ['src-a'],
    publishedAt: '2026-11-10T08:00:00.000Z',
    temporalQuality: 'source-published',
    firstSeenAt: seen,
    lastSeenAt: seen,
    fetchedAt: seen,
    autoCategories: [],
    ...overrides,
  };
}

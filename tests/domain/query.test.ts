import { describe, expect, it } from 'vitest';
import type { Article, ArticleUserState } from '../../src/domain/content.types';
import { defaultCategories } from '../../src/domain/default-categories';
import { DEFAULT_QUERY, last7DaysWindow, runQuery, type ArticleQuery, type QueryContext } from '../../src/domain/query';
import { makeArticle, makeSource } from '../helpers';

// Now: 2026-11-12 10:00 in Toronto (15:00Z).
const NOW = new Date('2026-11-12T15:00:00Z');
const seen = (iso: string) => ({ firstSeenAt: iso, lastSeenAt: iso, fetchedAt: iso });

function art(id: string, title: string, extra: Partial<Article> = {}): Article {
  return makeArticle({
    id,
    title,
    canonicalUrl: `https://a.example.org/${id}`,
    ...seen('2026-11-12T14:00:00.000Z'),
    ...extra,
  });
}
function undated(id: string, title: string, extra: Partial<Article> = {}): Article {
  const { publishedAt: _drop, ...rest } = art(id, title, extra);
  return { ...rest, temporalQuality: 'unknown' };
}

const articles: Article[] = [
  art('today', 'PHP 8.5 est sorti', { publishedAt: '2026-11-12T13:00:00.000Z' }),
  art('yesterday-utc-but-today-local', 'Faille de sécurité WordPress', { publishedAt: '2026-11-12T06:00:00.000Z' }),
  art('late-yesterday-local', 'Design typography trends', { publishedAt: '2026-11-12T04:30:00.000Z' }),
  art('old-found-today', 'Old LLM paper', { publishedAt: '2026-10-01T00:00:00.000Z' }),
  undated('nodate', 'Annonce sans date'),
  art('found-last-week', 'Startup seed round', {
    publishedAt: '2026-11-06T12:00:00.000Z',
    ...seen('2026-11-06T13:00:00.000Z'),
  }),
  art('src-b', 'Hiring news', {
    publishedAt: '2026-11-11T12:00:00.000Z',
    sourceIds: ['src-b'],
    provenance: [
      {
        sourceId: 'src-b',
        originalUrl: 'https://jobs.example.net/x',
        firstSeenAt: '2026-11-12T14:00:00.000Z',
        lastSeenAt: '2026-11-12T14:00:00.000Z',
      },
    ],
  }),
];

const states = new Map<string, ArticleUserState>([
  ['today', { articleId: 'today', isSaved: true, isRead: false, savedAt: '2026-11-12T14:30:00.000Z' }],
  ['nodate', { articleId: 'nodate', isSaved: false, isRead: true, readAt: '2026-11-12T14:31:00.000Z' }],
]);

const ctx: QueryContext = {
  now: NOW,
  timeZone: 'America/Toronto',
  categories: defaultCategories(),
  sourcesById: new Map([
    ['src-a', makeSource({ id: 'src-a', name: 'Blog Alpha' })],
    ['src-b', makeSource({ id: 'src-b', name: 'Emplois Beta' })],
  ]),
  userStates: states,
};

const ids = (q: Partial<ArticleQuery>) => runQuery(articles, { ...DEFAULT_QUERY, ...q }, ctx).map((r) => r.article.id);

describe('runQuery filters', () => {
  it('"published today" uses the local day and declared dates only', () => {
    expect(ids({ published: 'today', sort: 'published-desc' })).toEqual(['today', 'yesterday-utc-but-today-local']);
  });

  it('"discovered today" is separate from "published today"', () => {
    const d = ids({ discovered: 'today' });
    expect(d).toContain('old-found-today');
    expect(d).toContain('nodate');
    expect(d).not.toContain('found-last-week');
  });

  it('never includes undated articles in publication windows, but can list them explicitly', () => {
    expect(ids({ published: 'last7days' })).not.toContain('nodate');
    expect(ids({ published: 'unknown' })).toEqual(['nodate']);
  });

  it('last 7 days covers today plus six previous local days', () => {
    const w = last7DaysWindow(NOW, 'America/Toronto');
    expect(w.start.toISOString()).toBe('2026-11-06T05:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-11-13T05:00:00.000Z');
    expect(ids({ published: 'last7days' })).toContain('found-last-week');
  });

  it('filters by category, source, saved and read state', () => {
    expect(ids({ categoryId: 'wordpress-php' })).toEqual(
      expect.arrayContaining(['today', 'yesterday-utc-but-today-local']),
    );
    expect(ids({ categoryId: 'cybersecurity' })).toEqual(['yesterday-utc-but-today-local']);
    expect(ids({ sourceId: 'src-b' })).toEqual(['src-b']);
    expect(ids({ saved: 'yes' })).toEqual(['today']);
    expect(ids({ read: 'yes' })).toEqual(['nodate']);
    expect(ids({ read: 'no' })).not.toContain('nodate');
  });

  it('searches title, source name, domain and category label, accent-insensitively', () => {
    expect(ids({ text: 'securite' })).toEqual(['yesterday-utc-but-today-local']);
    expect(ids({ text: 'emplois' })).toEqual(['src-b']);
    expect(ids({ text: 'jobs.example' })).toEqual(['src-b']);
    expect(ids({ text: 'cybersecurity' })).toEqual(['yesterday-utc-but-today-local']);
    expect(ids({ text: 'php sorti' })).toEqual(['today']);
    expect(ids({ text: 'zzz' })).toEqual([]);
  });

  it('combines filters with AND', () => {
    expect(ids({ text: 'sorti', saved: 'no' })).toEqual([]);
    expect(ids({ text: 'sorti', saved: 'yes' })).toEqual(['today']);
    // "php" also matches the WordPress/PHP category label of another article.
    expect(ids({ text: 'php', saved: 'no' })).toEqual(['yesterday-utc-but-today-local']);
  });
});

describe('runQuery sorting', () => {
  it('discovery order is reproducible (ties broken by id)', () => {
    const a = ids({});
    expect(a).toEqual(ids({}));
    expect(a.at(-1)).toBe('found-last-week');
    const tied = a.slice(0, -1);
    expect(tied).toEqual([...tied].sort());
  });

  it('publication order puts undated articles last', () => {
    const p = ids({ sort: 'published-desc' });
    expect(p[0]).toBe('today');
    expect(p.at(-1)).toBe('nodate');
  });

  it('title order is locale-aware', () => {
    expect(ids({ sort: 'title-asc' })[0]).toBe('nodate'); // "Annonce…"
  });
});

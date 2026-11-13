/**
 * Search, filters and sorting for the article list. Pure and deterministic:
 * the same inputs and clock always give the same ordered output.
 *
 * Date filters never substitute one date for another: a "published" filter
 * only considers declared source dates (undated articles are excluded and
 * can be listed explicitly with `published: 'unknown'`); a "discovered"
 * filter only considers `firstSeenAt`.
 */
import { classifyArticle, normalizeForMatch } from './classify';
import type { Article, ArticleUserState, Category, Source } from './content.types';
import { isDiscoveredWithin, isPublishedWithin, localTodayWindow, startOfLocalDay, type UtcWindow } from './freshness';

export type PublishedFilter = 'any' | 'today' | 'last7days' | 'unknown';
export type DiscoveredFilter = 'any' | 'today' | 'last7days';
export type TriState = 'any' | 'yes' | 'no';
export type SortKey = 'discovered-desc' | 'published-desc' | 'title-asc';

export interface ArticleQuery {
  text: string;
  categoryId: string | 'any';
  sourceId: string | 'any';
  saved: TriState;
  read: TriState;
  published: PublishedFilter;
  discovered: DiscoveredFilter;
  sort: SortKey;
}

export const DEFAULT_QUERY: ArticleQuery = {
  text: '',
  categoryId: 'any',
  sourceId: 'any',
  saved: 'any',
  read: 'any',
  published: 'any',
  discovered: 'any',
  sort: 'discovered-desc',
};

export interface QueryContext {
  now: Date;
  timeZone: string;
  categories: Category[];
  sourcesById: Map<string, Source>;
  userStates: Map<string, ArticleUserState>;
}

export interface QueryResultItem {
  article: Article;
  categoryIds: string[];
}

export function last7DaysWindow(now: Date, timeZone: string): UtcWindow {
  const today = localTodayWindow(now, timeZone);
  // Six local days back from today's start (DST-safe: snap via startOfLocalDay).
  const start = startOfLocalDay(new Date(today.start.getTime() - 6 * 86_400_000 + 12 * 3_600_000), timeZone);
  return { start, end: today.end };
}

export function runQuery(articles: Article[], q: ArticleQuery, ctx: QueryContext): QueryResultItem[] {
  const needle = normalizeForMatch(q.text).trim();
  const terms = needle === '' ? [] : needle.split(' ');
  const today = localTodayWindow(ctx.now, ctx.timeZone);
  const week = last7DaysWindow(ctx.now, ctx.timeZone);
  const catLabel = new Map(ctx.categories.map((c) => [c.id, c.label]));

  const out: QueryResultItem[] = [];
  for (const a of articles) {
    const state = ctx.userStates.get(a.id);
    const { categoryIds } = classifyArticle(a, ctx.categories, state);

    if (q.categoryId !== 'any' && !categoryIds.includes(q.categoryId)) continue;
    if (q.sourceId !== 'any' && !a.sourceIds.includes(q.sourceId)) continue;
    if (q.saved !== 'any' && (state?.isSaved ?? false) !== (q.saved === 'yes')) continue;
    if (q.read !== 'any' && (state?.isRead ?? false) !== (q.read === 'yes')) continue;

    if (q.published === 'unknown' && a.publishedAt !== undefined) continue;
    if (q.published === 'today' && !isPublishedWithin(a, today)) continue;
    if (q.published === 'last7days' && !isPublishedWithin(a, week)) continue;
    if (q.discovered === 'today' && !isDiscoveredWithin(a, today)) continue;
    if (q.discovered === 'last7days' && !isDiscoveredWithin(a, week)) continue;

    if (terms.length > 0) {
      const hay = normalizeForMatch(
        [
          a.title,
          ...a.sourceIds.map((id) => ctx.sourcesById.get(id)?.name ?? ''),
          ...a.provenance.map((p) => hostOf(p.originalUrl)),
          ...categoryIds.map((id) => catLabel.get(id) ?? ''),
        ].join(' '),
      );
      if (!terms.every((t) => hay.includes(` ${t}`))) continue;
    }
    out.push({ article: a, categoryIds });
  }
  return out.sort((x, y) => compare(x.article, y.article, q.sort));
}

function compare(a: Article, b: Article, sort: SortKey): number {
  const byId = a.id.localeCompare(b.id);
  switch (sort) {
    case 'discovered-desc':
      return cmpDesc(a.firstSeenAt, b.firstSeenAt) || byId;
    case 'published-desc': {
      // Undated articles go last, never mixed with dated ones.
      if (a.publishedAt === undefined && b.publishedAt === undefined)
        return cmpDesc(a.firstSeenAt, b.firstSeenAt) || byId;
      if (a.publishedAt === undefined) return 1;
      if (b.publishedAt === undefined) return -1;
      return cmpDesc(a.publishedAt, b.publishedAt) || byId;
    }
    case 'title-asc':
      return a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }) || byId;
  }
}

const cmpDesc = (x: string, y: string) => (x === y ? 0 : x < y ? 1 : -1);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Official Hacker News API (https://github.com/HackerNews/API), v0.
 * Verified 2026-11-12: `topstories` returns up to 500 ids, one request per
 * item, no documented rate limit, permissive CORS for extension origins
 * (observed, not documented — hence `corsOrigins`).
 *
 * The HN score is stored as a source metric named `hn.score` and must only
 * ever be presented as "HN signal", never as general web popularity.
 */
import { z } from 'zod';
import type { Source } from '../domain/content.types';
import { unixToIso } from '../domain/dates';
import { MAX_TITLE_LENGTH, htmlToText, truncate } from '../domain/text';
import { toIsoUtc } from '../shared/clock';
import { ConnectorError } from '../shared/failures';
import { fetchResource, mapWithConcurrency } from './network-client';
import { validDrafts, type SourceConnector } from './source-connector';

export const HN_API_ORIGIN = 'https://hacker-news.firebaseio.com';
export const HN_SITE = 'https://news.ycombinator.com';
export const HN_SOURCE_ID = 'hacker-news';
export const HN_MAX_ITEMS = 30;
const HN_CONCURRENCY = 6;

export type HnList = 'topstories' | 'newstories';

const idList = z.array(z.number().int().positive());
const hnItem = z.object({
  id: z.number().int().positive(),
  type: z.string().optional(),
  deleted: z.boolean().optional(),
  dead: z.boolean().optional(),
  by: z.string().optional(),
  time: z.number().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  score: z.number().optional(),
  descendants: z.number().optional(),
});

export function hackerNewsSource(createdAt: string, list: HnList = 'topstories'): Source {
  return {
    id: HN_SOURCE_ID,
    kind: 'hacker-news',
    name: list === 'topstories' ? 'Hacker News — Top stories' : 'Hacker News — New stories',
    origin: HN_API_ORIGIN,
    feedUrl: `${HN_API_ORIGIN}/v0/${list}.json`,
    enabled: true,
    health: 'never-fetched',
    attributionUrl: `${HN_SITE}/`,
    categoryIds: ['technology'],
    createdAt,
    termsCheckedAt: '2026-11-12T00:00:00.000Z',
    consecutiveFailures: 0,
  };
}

export const hackerNewsConnector: SourceConnector = {
  kind: 'hacker-news',

  checkConfiguration(source) {
    const issues: string[] = [];
    if (source.kind !== 'hacker-news') issues.push('Type de source incorrect.');
    if (
      !source.feedUrl ||
      !/^https:\/\/hacker-news\.firebaseio\.com\/v0\/(topstories|newstories)\.json$/.test(source.feedUrl)
    ) {
      issues.push('Liste HN non prise en charge.');
    }
    return { ok: issues.length === 0, issues };
  },

  async fetchLatest(source, options, deps) {
    const config = this.checkConfiguration(source);
    if (!config.ok || !source.feedUrl) throw new ConnectorError('other', config.issues.join(' '));
    const net = { expect: 'json' as const, signal: options.signal, corsOrigins: [HN_API_ORIGIN] };

    const listRes = await fetchResource(source.feedUrl, net, deps);
    const ids = idList.safeParse(safeJson(listRes.text));
    if (!ids.success) throw new ConnectorError('parse', 'Liste d’identifiants HN invalide.');
    const wanted = ids.data.slice(0, Math.min(options.maxItems, HN_MAX_ITEMS));

    const warnings: string[] = [];
    const now = deps.clock.now();
    const raw = await mapWithConcurrency(wanted, HN_CONCURRENCY, async (id) => {
      try {
        const res = await fetchResource(`${HN_API_ORIGIN}/v0/item/${id}.json`, net, deps);
        const parsed = hnItem.safeParse(safeJson(res.text));
        if (!parsed.success) {
          warnings.push('item-skipped:invalid');
          return null;
        }
        return parsed.data;
      } catch (err) {
        // One failing item never fails the whole collection, except on abort.
        if (err instanceof ConnectorError && (err.code === 'aborted' || err.code === 'rate-limit')) throw err;
        warnings.push(`item-failed:${err instanceof ConnectorError ? err.code : 'other'}`);
        return null;
      }
    });

    const candidates = [];
    for (const item of raw) {
      if (!item) continue;
      if (item.deleted || item.dead) {
        warnings.push('item-skipped:deleted-or-dead');
        continue;
      }
      if (item.type !== 'story' && item.type !== 'job') {
        warnings.push('item-skipped:type');
        continue;
      }
      const title = item.title ? truncate(htmlToText(item.title), MAX_TITLE_LENGTH) : '';
      if (!title) {
        warnings.push('item-skipped:no-title');
        continue;
      }
      const discussion = `${HN_SITE}/item?id=${item.id}`;
      const date = item.time !== undefined ? unixToIso(item.time, now) : undefined;
      if (date?.warning) warnings.push(date.warning);
      const metrics = [];
      if (item.score !== undefined) metrics.push({ metric: 'hn.score', value: item.score });
      if (item.descendants !== undefined) metrics.push({ metric: 'hn.comments', value: item.descendants });
      candidates.push({
        externalId: String(item.id),
        title,
        // Ask HN / text posts have no external URL: link to the discussion.
        url: item.url && /^https?:\/\//i.test(item.url) ? item.url : discussion,
        ...(date?.iso ? { publishedAt: date.iso } : {}),
        ...(item.by ? { byline: item.by } : {}),
        ...(metrics.length ? { metrics } : {}),
      });
    }
    return { drafts: validDrafts(candidates, warnings), fetchedAt: toIsoUtc(deps.clock.now()), warnings };
  },
};

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ConnectorError('parse', 'JSON invalide.');
  }
}

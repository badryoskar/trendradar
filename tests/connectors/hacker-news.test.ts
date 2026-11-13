import { describe, expect, it } from 'vitest';
import { HN_API_ORIGIN, hackerNewsConnector, hackerNewsSource } from '../../src/connectors/hacker-news';
import { ConnectorError } from '../../src/shared/failures';
import { fakeFetch, json, netDeps, respond, type Route } from '../net-helpers';

// SYNTHETIC HN-shaped data (field names per https://github.com/HackerNews/API).
const T = 1_794_456_000; // 2026-11-12T04:00:00Z
const ITEMS: Record<number, unknown> = {
  1: {
    id: 1,
    type: 'story',
    by: 'alice',
    time: T,
    title: 'Show HN: A &amp; B',
    url: 'https://example.org/show',
    score: 120,
    descendants: 33,
  },
  2: { id: 2, type: 'story', by: 'bob', time: T, title: 'Ask HN: How do you X?', score: 15 },
  3: { id: 3, deleted: true, type: 'story', time: T },
  4: { id: 4, dead: true, type: 'story', title: 'dead', url: 'https://example.org/dead', time: T },
  5: { id: 5, type: 'comment', by: 'c', text: 'hi', time: T },
  6: { id: 6, type: 'story', time: T, url: 'https://example.org/no-title' },
  8: { id: 8, type: 'job', title: 'Example (YC) is hiring', url: 'https://example.org/jobs', time: T },
  9: { id: 9, type: 'story', title: 'javascript url', url: 'javascript:alert(1)', time: T, score: 1 },
};

function hnRoutes(ids: number[], overrides: Record<string, Route> = {}) {
  const routes: Record<string, Route> = { [`${HN_API_ORIGIN}/v0/topstories.json`]: () => json(ids) };
  for (const id of ids) routes[`${HN_API_ORIGIN}/v0/item/${id}.json`] = () => json(ITEMS[id] ?? null);
  return { ...routes, ...overrides };
}

const source = hackerNewsSource('2026-11-12T00:00:00.000Z');

describe('Hacker News connector', () => {
  it('maps stories and jobs, skips deleted/dead/comments/untitled, never needs a host permission', async () => {
    const f = fakeFetch(
      hnRoutes([1, 2, 3, 4, 5, 6, 7, 8, 9], {
        [`${HN_API_ORIGIN}/v0/item/7.json`]: () => respond('err', { status: 500 }),
      }),
    );
    const res = await hackerNewsConnector.fetchLatest(source, { maxItems: 30 }, netDeps(f.impl, []));
    expect(res.drafts.map((d) => d.externalId)).toEqual(['1', '2', '8', '9']);
    const [show, ask, job, js] = res.drafts;
    expect(show).toMatchObject({
      title: 'Show HN: A & B',
      url: 'https://example.org/show',
      publishedAt: '2026-11-12T04:00:00.000Z',
      byline: 'alice',
      metrics: [
        { metric: 'hn.score', value: 120 },
        { metric: 'hn.comments', value: 33 },
      ],
    });
    // Text posts link to the HN discussion, never to an invented URL.
    expect(ask?.url).toBe('https://news.ycombinator.com/item?id=2');
    expect(job?.title).toBe('Example (YC) is hiring');
    expect(js?.url).toBe('https://news.ycombinator.com/item?id=9');
    expect(res.warnings).toEqual(
      expect.arrayContaining([
        'item-skipped:deleted-or-dead',
        'item-skipped:type',
        'item-skipped:no-title',
        'item-failed:http',
      ]),
    );
  });

  it('requests at most 30 items even if more are asked', async () => {
    const ids = Array.from({ length: 500 }, (_, i) => 1000 + i);
    const routes: Record<string, Route> = { [`${HN_API_ORIGIN}/v0/topstories.json`]: () => json(ids) };
    for (const id of ids)
      routes[`${HN_API_ORIGIN}/v0/item/${id}.json`] = () => json({ id, type: 'story', title: `t${id}`, time: T });
    const f = fakeFetch(routes);
    const res = await hackerNewsConnector.fetchLatest(source, { maxItems: 500 }, netDeps(f.impl));
    expect(res.drafts).toHaveLength(30);
    expect(f.calls).toHaveLength(31);
  });

  it('fails cleanly on an invalid id list', async () => {
    const f = fakeFetch({ [`${HN_API_ORIGIN}/v0/topstories.json`]: () => json({ not: 'a list' }) });
    await expect(hackerNewsConnector.fetchLatest(source, { maxItems: 30 }, netDeps(f.impl))).rejects.toMatchObject({
      code: 'parse',
    });
  });

  it('propagates throttling instead of silently returning a partial list', async () => {
    const f = fakeFetch(hnRoutes([1], { [`${HN_API_ORIGIN}/v0/item/1.json`]: () => respond('', { status: 429 }) }));
    await expect(hackerNewsConnector.fetchLatest(source, { maxItems: 30 }, netDeps(f.impl))).rejects.toBeInstanceOf(
      ConnectorError,
    );
  });

  it('only accepts the official list endpoints', () => {
    expect(hackerNewsConnector.checkConfiguration({ ...source, feedUrl: 'https://evil.example.org/x.json' }).ok).toBe(
      false,
    );
  });
});

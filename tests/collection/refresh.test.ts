import { describe, expect, it } from 'vitest';
import { addFeedSource, addHackerNews, feedSourceId } from '../../src/collection/add-source';
import { refreshSources } from '../../src/collection/refresh';
import { DEMO_SOURCE_ID } from '../../src/domain/demo-dataset';
import { loadDemoData } from '../../src/persistence/demo';
import { countArticles, getSource, listSources, putSource } from '../../src/persistence/repositories';
import { deleteSource, listAttempts } from '../../src/persistence/sources';
import { setSaved } from '../../src/persistence/repositories';
import { fixedClock } from '../../src/shared/clock';
import { freshDb, makeSource } from '../helpers';
import { fakeFetch, fixtureText, netDeps, respond, xml, type Route } from '../net-helpers';

const GOOD = 'https://blog.example.org/feed.xml';
const BAD = 'https://down.example.org/feed.xml';
const SLOW = 'https://throttle.example.org/feed.xml';
const grants = ['https://blog.example.org/*', 'https://down.example.org/*', 'https://throttle.example.org/*'];

function routes(extra: Record<string, Route> = {}) {
  return {
    [GOOD]: () => xml(fixtureText('rss/basic.xml')),
    [BAD]: () => respond('oops', { status: 500 }),
    [SLOW]: () => respond('', { status: 429, headers: { 'retry-after': '7200' } }),
    ...extra,
  };
}

function feed(id: string, url: string) {
  const u = new URL(url);
  return makeSource({ id, name: id, origin: u.origin, feedUrl: url, attributionUrl: `${u.origin}/` });
}

describe('refreshSources', () => {
  it('isolates failures: a failing source keeps its data and does not block others', async () => {
    const db = await freshDb();
    await putSource(db, feed('good', GOOD));
    await putSource(db, feed('bad', BAD));
    const f = fakeFetch(routes());
    const deps = netDeps(f.impl, grants);
    const first = await refreshSources(db, (await listSources(db)).items, deps);
    expect(first.results.good).toMatchObject({ status: 'ok', inserted: 4 });
    expect(first.results.bad).toMatchObject({ status: 'error', code: 'http' });

    // Second run: idempotent, no duplicates; still 4 articles.
    await refreshSources(db, (await listSources(db)).items, deps);
    expect(await countArticles(db)).toBe(4);

    const bad = (await getSource(db, 'bad'))!;
    expect(bad).toMatchObject({ health: 'backoff', lastErrorCode: 'http', consecutiveFailures: 1 });
    expect(bad.lastSuccessAt).toBeUndefined();
    const good = (await getSource(db, 'good'))!;
    expect(good).toMatchObject({ health: 'ok', consecutiveFailures: 0, detectedFormat: 'rss2' });
    expect(good.lastSuccessAt).toBe('2026-11-12T12:00:00.000Z');
    expect((await listAttempts(db, 'good'))[0]).toMatchObject({
      success: true,
      fetchedCount: 4,
      oldestItemPublishedAt: '2026-11-09T07:00:00.000Z',
    });
  });

  it('does not contact a feed whose host permission is missing', async () => {
    const db = await freshDb();
    await putSource(db, feed('good', GOOD));
    const f = fakeFetch(routes());
    const r = await refreshSources(db, (await listSources(db)).items, netDeps(f.impl, []));
    expect(r.results.good).toMatchObject({ status: 'error', code: 'permission' });
    expect(f.calls).toHaveLength(0);
    expect((await getSource(db, 'good'))!.health).toBe('permission-needed');
  });

  it('backs off after throttling, honouring Retry-After, then skips until it expires', async () => {
    const db = await freshDb();
    await putSource(db, feed('slow', SLOW));
    const f = fakeFetch(routes());
    await refreshSources(db, (await listSources(db)).items, netDeps(f.impl, grants));
    const s = (await getSource(db, 'slow'))!;
    expect(s.health).toBe('backoff');
    expect(s.backoffUntil).toBe('2026-11-12T14:00:00.000Z'); // Retry-After 2h > 1h step
    const again = await refreshSources(
      db,
      (await listSources(db)).items,
      netDeps(f.impl, grants, '2026-11-12T13:00:00.000Z'),
    );
    expect(again.results.slow).toMatchObject({ status: 'skipped', reason: 'backoff' });
    expect(f.calls).toHaveLength(1);
  });

  it('skips disabled and demo sources', async () => {
    const db = await freshDb();
    await putSource(db, { ...feed('off', GOOD), enabled: false });
    await loadDemoData(db, fixedClock('2026-11-12T12:00:00.000Z'));
    const f = fakeFetch(routes());
    const r = await refreshSources(db, (await listSources(db)).items, netDeps(f.impl, grants));
    expect(r.results.off).toMatchObject({ status: 'skipped', reason: 'disabled' });
    expect(r.results[DEMO_SOURCE_ID]).toMatchObject({ status: 'skipped', reason: 'demo' });
    expect(f.calls).toHaveLength(0);
  });
});

describe('adding and deleting sources', () => {
  it('tests the feed before saving and names it from the feed title', async () => {
    const db = await freshDb();
    const f = fakeFetch(routes());
    const out = await addFeedSource(db, { url: GOOD }, true, netDeps(f.impl, grants));
    expect(out).toMatchObject({ status: 'added', inserted: 4, source: { name: 'Blog Exemple & Co', health: 'ok' } });
    expect(await addFeedSource(db, { url: GOOD }, true, netDeps(f.impl, grants))).toMatchObject({
      status: 'duplicate',
    });
  });

  it('does not store a feed that fails its test collection', async () => {
    const db = await freshDb();
    const f = fakeFetch(
      routes({ [GOOD]: () => respond('<html/>', { status: 200, headers: { 'content-type': 'text/html' } }) }),
    );
    expect(await addFeedSource(db, { url: GOOD }, true, netDeps(f.impl, grants))).toMatchObject({
      status: 'failed',
      code: 'invalid-content-type',
    });
    expect(await db.count('sources')).toBe(0);
  });

  it('stores a refused-permission feed as permission-needed without contacting it', async () => {
    const db = await freshDb();
    const f = fakeFetch(routes());
    const out = await addFeedSource(db, { url: GOOD, name: 'Mon blog' }, false, netDeps(f.impl));
    expect(out).toMatchObject({
      status: 'permission-needed',
      source: { name: 'Mon blog', health: 'permission-needed' },
    });
    expect(f.calls).toHaveLength(0);
  });

  it('rejects invalid URLs', async () => {
    const db = await freshDb();
    const f = fakeFetch({});
    expect(await addFeedSource(db, { url: 'http://blog.example.org/feed' }, true, netDeps(f.impl))).toMatchObject({
      status: 'invalid',
    });
  });

  it('deleting a source removes its articles but keeps saved ones and shared ones', async () => {
    const db = await freshDb();
    const deps = netDeps(fakeFetch(routes()).impl, grants);
    await addFeedSource(db, { url: GOOD }, true, deps);
    const id = feedSourceId(GOOD);
    const { items } = await (await import('../../src/persistence/repositories')).listArticlesByDiscovery(db);
    await setSaved(db, items[0]!.id, true, fixedClock('2026-11-12T12:00:00.000Z'));
    const r = await deleteSource(db, id);
    expect(r).toEqual({ deletedArticles: 3, keptSaved: 1 });
    expect(await countArticles(db)).toBe(1);
    expect(await db.count('sourceItems')).toBe(0);
    expect(await db.count('fetchAttempts')).toBe(0);
  });

  it('adds Hacker News once', async () => {
    const db = await freshDb();
    const clock = fixedClock('2026-11-12T12:00:00.000Z');
    await addHackerNews(db, { clock });
    await addHackerNews(db, { clock });
    expect((await listSources(db)).items.map((s) => s.id)).toEqual(['hacker-news']);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/domain/content.types';
import { DEMO_SOURCE_ID } from '../../src/domain/demo-dataset';
import { DB_VERSION, openTrendRadarDb } from '../../src/persistence/db';
import { hasDemoData, loadDemoData, removeDemoData } from '../../src/persistence/demo';
import {
  StorageValidationError,
  clearReadingHistory,
  countArticles,
  deleteAllData,
  getSettings,
  getUserState,
  listArticlesByDiscovery,
  listCategories,
  purgeExpiredArticles,
  putArticle,
  putSettings,
  putSource,
  setRead,
  setSaved,
} from '../../src/persistence/repositories';
import { fixedClock } from '../../src/shared/clock';
import { freshDb, makeArticle, makeSource } from '../helpers';

const clock = fixedClock('2026-11-12T12:00:00.000Z');

describe('schema v1 migration', () => {
  it('creates every store and seeds default categories', async () => {
    const db = await freshDb();
    expect([...db.objectStoreNames].sort()).toEqual(
      [
        'articles',
        'categories',
        'clusters',
        'dedupCandidates',
        'fetchAttempts',
        'meta',
        'sourceItems',
        'sources',
        'trendSignals',
        'userState',
      ].sort(),
    );
    const { items } = await listCategories(db);
    expect(items.map((c) => c.id)).toContain('wordpress-php');
    expect(items.at(-1)?.id).toBe('unclassified');
    expect((await db.get('meta', 'schemaVersion'))?.value).toBe(DB_VERSION);
    db.close();
  });

  it('persists data across connections (reopen)', async () => {
    const name = `reopen-${Math.random()}`;
    const db1 = await openTrendRadarDb({ name });
    await putSource(db1, makeSource());
    await putArticle(db1, makeArticle());
    await setSaved(db1, 'art-1', true, clock);
    db1.close();
    const db2 = await openTrendRadarDb({ name });
    expect(await countArticles(db2)).toBe(1);
    expect((await getUserState(db2, 'art-1')).isSaved).toBe(true);
    db2.close();
  });
});

describe('repositories', () => {
  it('rejects invalid records on write', async () => {
    const db = await freshDb();
    await expect(putArticle(db, makeArticle({ canonicalUrl: 'javascript:alert(1)' }))).rejects.toBeInstanceOf(
      StorageValidationError,
    );
    expect(await countArticles(db)).toBe(0);
  });

  it('skips corrupted records on read and counts them', async () => {
    const db = await freshDb();
    await putArticle(db, makeArticle());
    // Simulate a corrupted record written outside the repository.
    await db.put('articles', { ...makeArticle({ id: 'bad', canonicalUrl: 'https://a.example.org/bad' }), title: '' });
    const r = await listArticlesByDiscovery(db);
    expect(r.items.map((a) => a.id)).toEqual(['art-1']);
    expect(r.invalidCount).toBe(1);
  });

  it('enforces one article per canonical URL', async () => {
    const db = await freshDb();
    await putArticle(db, makeArticle());
    await expect(putArticle(db, makeArticle({ id: 'art-2' }))).rejects.toBeTruthy();
  });

  it('orders by discovery date, newest first, ties by id', async () => {
    const db = await freshDb();
    const seen = (iso: string) => ({ firstSeenAt: iso, lastSeenAt: iso, fetchedAt: iso });
    await putArticle(
      db,
      makeArticle({ id: 'b', canonicalUrl: 'https://a.example.org/b', ...seen('2026-11-10T00:00:00.000Z') }),
    );
    await putArticle(
      db,
      makeArticle({ id: 'a', canonicalUrl: 'https://a.example.org/a', ...seen('2026-11-10T00:00:00.000Z') }),
    );
    await putArticle(
      db,
      makeArticle({ id: 'c', canonicalUrl: 'https://a.example.org/c', ...seen('2026-11-11T00:00:00.000Z') }),
    );
    expect((await listArticlesByDiscovery(db)).items.map((a) => a.id)).toEqual(['c', 'a', 'b']);
  });

  it('re-writing an article (refresh) does not touch read/saved state', async () => {
    const db = await freshDb();
    await putArticle(db, makeArticle());
    await setRead(db, 'art-1', true, clock);
    await setSaved(db, 'art-1', true, clock);
    await putArticle(db, makeArticle({ title: 'Titre mis à jour' }));
    const s = await getUserState(db, 'art-1');
    expect(s).toMatchObject({
      isRead: true,
      isSaved: true,
      readAt: '2026-11-12T12:00:00.000Z',
      savedAt: '2026-11-12T12:00:00.000Z',
    });
  });

  it('refuses user state for unknown articles (relational integrity)', async () => {
    const db = await freshDb();
    await expect(setSaved(db, 'missing', true, clock)).rejects.toThrow(/Unknown article/);
    expect(await db.count('userState')).toBe(0);
  });

  it('unsaving removes savedAt', async () => {
    const db = await freshDb();
    await putArticle(db, makeArticle());
    await setSaved(db, 'art-1', true, clock);
    const s = await setSaved(db, 'art-1', false, clock);
    expect(s.isSaved).toBe(false);
    expect(s.savedAt).toBeUndefined();
  });

  it('clears reading history but keeps favourites', async () => {
    const db = await freshDb();
    await putArticle(db, makeArticle());
    await putArticle(db, makeArticle({ id: 'art-2', canonicalUrl: 'https://a.example.org/2' }));
    await setRead(db, 'art-1', true, clock);
    await setSaved(db, 'art-1', true, clock);
    await setRead(db, 'art-2', true, clock);
    expect(await clearReadingHistory(db)).toBe(2);
    expect(await getUserState(db, 'art-1')).toMatchObject({ isRead: false, isSaved: true });
    expect(await getUserState(db, 'art-2')).toMatchObject({ isRead: false, isSaved: false });
  });

  it('settings default and round-trip', async () => {
    const db = await freshDb();
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
    await putSettings(db, { ...DEFAULT_SETTINGS, retentionDays: 7 });
    expect((await getSettings(db)).retentionDays).toBe(7);
    await expect(putSettings(db, { ...DEFAULT_SETTINGS, retentionDays: 0 })).rejects.toBeInstanceOf(
      StorageValidationError,
    );
  });
});

describe('retention purge', () => {
  it('removes expired articles and their links, keeps saved ones', async () => {
    const db = await freshDb();
    const old = '2026-10-01T00:00:00.000Z';
    await putArticle(
      db,
      makeArticle({
        id: 'old',
        canonicalUrl: 'https://a.example.org/old',
        firstSeenAt: old,
        lastSeenAt: old,
        fetchedAt: old,
      }),
    );
    await putArticle(
      db,
      makeArticle({
        id: 'old-saved',
        canonicalUrl: 'https://a.example.org/old-saved',
        firstSeenAt: old,
        lastSeenAt: old,
        fetchedAt: old,
      }),
    );
    await putArticle(db, makeArticle({ id: 'recent', canonicalUrl: 'https://a.example.org/recent' }));
    await db.put('sourceItems', { sourceId: 'src-a', externalId: 'g-old', articleId: 'old' });
    await setSaved(db, 'old-saved', true, clock);
    await setRead(db, 'old', true, clock);

    const removed = await purgeExpiredArticles(db, { ...DEFAULT_SETTINGS, retentionDays: 30 }, clock);
    expect(removed).toBe(1);
    expect((await listArticlesByDiscovery(db)).items.map((a) => a.id).sort()).toEqual(['old-saved', 'recent']);
    expect(await db.get('userState', 'old')).toBeUndefined();
    expect(await db.count('sourceItems')).toBe(0);
  });
});

describe('delete all data', () => {
  it('erases everything and restores default categories', async () => {
    const db = await freshDb();
    await putSource(db, makeSource());
    await putArticle(db, makeArticle());
    await setSaved(db, 'art-1', true, clock);
    await putSettings(db, { ...DEFAULT_SETTINGS, onboardingCompleted: true });
    await deleteAllData(db);
    expect(await countArticles(db)).toBe(0);
    expect(await db.count('sources')).toBe(0);
    expect(await db.count('userState')).toBe(0);
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
    expect((await listCategories(db)).items.length).toBeGreaterThan(5);
  });
});

describe('demo dataset (synthetic, labelled)', () => {
  it('loads idempotently and is removable without touching real data', async () => {
    const db = await freshDb();
    await putSource(db, makeSource());
    await putArticle(db, makeArticle());
    const n = await loadDemoData(db, clock);
    await loadDemoData(db, clock);
    await loadDemoData(db, clock);
    expect(await countArticles(db)).toBe(n + 1);
    expect(await hasDemoData(db)).toBe(true);

    const demoSource = await db.get('sources', DEMO_SOURCE_ID);
    expect(demoSource?.isDemo).toBe(true);
    expect(demoSource?.enabled).toBe(false);
    const all = (await listArticlesByDiscovery(db)).items;
    for (const a of all.filter((x) => x.sourceIds.includes(DEMO_SOURCE_ID))) {
      expect(new URL(a.canonicalUrl).hostname).toBe('example.com');
      expect(a.title.startsWith('[Démo]')).toBe(true);
    }
    // The demo includes an undated item and an old item discovered recently.
    expect(all.some((a) => a.temporalQuality === 'unknown' && a.publishedAt === undefined)).toBe(true);

    await setSaved(db, 'demo:php-84-release', true, clock);
    expect(await removeDemoData(db)).toBe(n);
    expect(await countArticles(db)).toBe(1);
    expect(await db.count('userState')).toBe(0);
    expect(await hasDemoData(db)).toBe(false);
  });
});

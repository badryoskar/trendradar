import { describe, expect, it } from 'vitest';
import type { ArticleDraft } from '../../src/connectors/source-connector';
import { ingestDrafts } from '../../src/persistence/ingest';
import {
  getUserState,
  listArticlesByDiscovery,
  putSource,
  setRead,
  setSaved,
} from '../../src/persistence/repositories';
import { fixedClock } from '../../src/shared/clock';
import { freshDb, makeSource } from '../helpers';

const A = makeSource({ id: 'src-a', name: 'A', categoryIds: ['technology'] });
const B = makeSource({
  id: 'src-b',
  name: 'B',
  origin: 'https://b.example.org',
  feedUrl: 'https://b.example.org/rss',
  categoryIds: ['ai'],
});

const drafts: ArticleDraft[] = [
  {
    externalId: 'g1',
    title: 'Premier',
    url: 'https://news.example.org/1?utm_source=a',
    publishedAt: '2026-11-10T08:00:00.000Z',
  },
  { externalId: 'g2', title: 'Sans date', url: 'https://news.example.org/2' },
  {
    externalId: 'g3',
    title: 'Avec extrait',
    url: 'https://news.example.org/3',
    excerpt: 'Extrait',
    excerptOrigin: 'feed',
    metrics: [{ metric: 'x', value: 1 }],
  },
];

async function setup() {
  const db = await freshDb();
  await putSource(db, A);
  await putSource(db, B);
  return db;
}

describe('ingestDrafts', () => {
  it('is idempotent when the same collection is replayed three times', async () => {
    const db = await setup();
    const r1 = await ingestDrafts(db, A, drafts, '2026-11-12T10:00:00.000Z');
    const r2 = await ingestDrafts(db, A, drafts, '2026-11-12T11:00:00.000Z');
    const r3 = await ingestDrafts(db, A, drafts, '2026-11-12T12:00:00.000Z');
    expect([r1.inserted, r2.inserted, r3.inserted]).toEqual([3, 0, 0]);
    expect(r3.updated).toBe(3);
    const { items } = await listArticlesByDiscovery(db);
    expect(items).toHaveLength(3);
    const first = items.find((a) => a.title === 'Premier')!;
    expect(first.provenance).toHaveLength(1);
    expect(first.firstSeenAt).toBe('2026-11-12T10:00:00.000Z');
    expect(first.lastSeenAt).toBe('2026-11-12T12:00:00.000Z');
    expect(first.canonicalUrl).toBe('https://news.example.org/1');
    expect(first.provenance[0]!.originalUrl).toBe('https://news.example.org/1?utm_source=a');
    expect(await db.count('sourceItems')).toBe(3);
  });

  it('never invents a publication date', async () => {
    const db = await setup();
    await ingestDrafts(db, A, drafts, '2026-11-12T10:00:00.000Z');
    const undated = (await listArticlesByDiscovery(db)).items.find((a) => a.title === 'Sans date')!;
    expect(undated.publishedAt).toBeUndefined();
    expect(undated.temporalQuality).toBe('unknown');
  });

  it('merges the same canonical URL across sources and keeps every provenance', async () => {
    const db = await setup();
    await ingestDrafts(db, A, drafts.slice(0, 1), '2026-11-12T10:00:00.000Z');
    await ingestDrafts(
      db,
      B,
      [
        {
          externalId: 'b-77',
          title: 'Titre différent chez B',
          url: 'https://news.example.org/1#top',
          publishedAt: '2026-11-11T00:00:00.000Z',
        },
      ],
      '2026-11-12T11:00:00.000Z',
    );
    const { items } = await listArticlesByDiscovery(db);
    expect(items).toHaveLength(1);
    const a = items[0]!;
    expect(a.sourceIds.sort()).toEqual(['src-a', 'src-b']);
    expect(a.provenance.map((p) => p.externalId).sort()).toEqual(['b-77', 'g1']);
    expect(a.title).toBe('Premier'); // first observed title kept
    expect(a.publishedAt).toBe('2026-11-10T08:00:00.000Z'); // first observed date never overwritten
    expect(a.autoCategories.sort()).toEqual(['ai', 'technology']);
  });

  it('does not merge different URLs with similar titles', async () => {
    const db = await setup();
    await ingestDrafts(
      db,
      A,
      [{ externalId: 'x', title: 'WordPress 7.0 released', url: 'https://a.example.org/wp7' }],
      '2026-11-12T10:00:00.000Z',
    );
    await ingestDrafts(
      db,
      B,
      [{ externalId: 'y', title: 'WordPress 7.0 released', url: 'https://b.example.org/wp7' }],
      '2026-11-12T10:00:00.000Z',
    );
    expect((await listArticlesByDiscovery(db)).items).toHaveLength(2);
  });

  it('fills a missing date later but keeps read/saved state untouched', async () => {
    const db = await setup();
    await ingestDrafts(db, A, drafts, '2026-11-12T10:00:00.000Z');
    const undated = (await listArticlesByDiscovery(db)).items.find((a) => a.title === 'Sans date')!;
    const clock = fixedClock('2026-11-12T10:30:00.000Z');
    await setRead(db, undated.id, true, clock);
    await setSaved(db, undated.id, true, clock);
    await ingestDrafts(db, A, [{ ...drafts[1]!, publishedAt: '2026-11-12T09:00:00.000Z' }], '2026-11-12T11:00:00.000Z');
    const after = (await listArticlesByDiscovery(db)).items.find((a) => a.id === undated.id)!;
    expect(after.publishedAt).toBe('2026-11-12T09:00:00.000Z');
    expect(after.temporalQuality).toBe('source-published');
    expect(await getUserState(db, undated.id)).toMatchObject({ isRead: true, isSaved: true });
  });

  it('updates source metrics with their capture time', async () => {
    const db = await setup();
    await ingestDrafts(db, A, drafts, '2026-11-12T10:00:00.000Z');
    await ingestDrafts(db, A, [{ ...drafts[2]!, metrics: [{ metric: 'x', value: 5 }] }], '2026-11-12T11:00:00.000Z');
    const a = (await listArticlesByDiscovery(db)).items.find((x) => x.title === 'Avec extrait')!;
    expect(a.provenance[0]!.metrics).toEqual([{ metric: 'x', value: 5, capturedAt: '2026-11-12T11:00:00.000Z' }]);
  });

  it('reports the oldest declared date for coverage', async () => {
    const db = await setup();
    const r = await ingestDrafts(db, A, drafts, '2026-11-12T10:00:00.000Z');
    expect(r.oldestPublishedAt).toBe('2026-11-10T08:00:00.000Z');
  });
});

import { fetchAttemptSchema, sourceSchema, type FetchAttempt, type Source } from '../domain/content.types';
import type { DB } from './db';

export async function recordAttempt(db: DB, attempt: FetchAttempt): Promise<void> {
  const { id: _ignored, ...rest } = fetchAttemptSchema.parse(attempt);
  await db.add('fetchAttempts', rest as FetchAttempt);
}

/** Most recent attempts for a source, newest first. */
export async function listAttempts(db: DB, sourceId: string, limit = 10): Promise<FetchAttempt[]> {
  const all = await db.getAllFromIndex('fetchAttempts', 'bySourceId', sourceId);
  return all.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, limit);
}

/**
 * Deletes a source. Articles seen only through this source are deleted
 * unless saved; articles also seen elsewhere just lose this provenance.
 * Saved single-source articles are kept (provenance retained) so the user
 * never loses a favourite silently.
 */
export async function deleteSource(db: DB, sourceId: string): Promise<{ deletedArticles: number; keptSaved: number }> {
  const tx = db.transaction(['sources', 'articles', 'sourceItems', 'userState', 'fetchAttempts'], 'readwrite');
  const articles = tx.objectStore('articles');
  let deletedArticles = 0;
  let keptSaved = 0;
  for (const a of await articles.index('bySourceId').getAll(sourceId)) {
    if (a.sourceIds.length > 1) {
      const provenance = a.provenance.filter((p) => p.sourceId !== sourceId);
      await articles.put({ ...a, provenance, sourceIds: [...new Set(provenance.map((p) => p.sourceId))] });
      continue;
    }
    const state = await tx.objectStore('userState').get(a.id);
    if (state?.isSaved) {
      keptSaved++;
      continue;
    }
    await articles.delete(a.id);
    await tx.objectStore('userState').delete(a.id);
    deletedArticles++;
  }
  const items = tx.objectStore('sourceItems');
  for (const key of await items.getAllKeys(IDBKeyRange.bound([sourceId, ''], [sourceId, '￿']))) await items.delete(key);
  const attempts = tx.objectStore('fetchAttempts');
  for (const key of await attempts.index('bySourceId').getAllKeys(sourceId)) await attempts.delete(key);
  await tx.objectStore('sources').delete(sourceId);
  await tx.done;
  return { deletedArticles, keptSaved };
}

export async function updateSource(db: DB, id: string, patch: (s: Source) => Source): Promise<Source> {
  const tx = db.transaction('sources', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new Error(`Unknown source ${id}`);
  }
  const next = sourceSchema.parse(patch(sourceSchema.parse(current)));
  await tx.store.put(next);
  await tx.done;
  return next;
}

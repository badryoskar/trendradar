/**
 * Repositories: the only code that touches IndexedDB stores directly.
 * Every write is validated against the domain schema; every read is
 * re-validated so a corrupted or older record is reported, never trusted.
 */
import type { z } from 'zod';
import {
  articleSchema,
  articleUserStateSchema,
  categorySchema,
  DEFAULT_SETTINGS,
  settingsSchema,
  sourceSchema,
  type Article,
  type ArticleUserState,
  type Category,
  type Settings,
  type Source,
} from '../domain/content.types';
import { toIsoUtc, type Clock } from '../shared/clock';
import { defaultCategories } from '../domain/default-categories';
import { DB_VERSION, type DB } from './db';

export class StorageValidationError extends Error {
  constructor(
    readonly store: string,
    readonly issues: string[],
  ) {
    super(`Invalid ${store} record: ${issues.join('; ')}`);
    this.name = 'StorageValidationError';
  }
}

function validate<T>(schema: z.ZodType<T>, store: string, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new StorageValidationError(
      store,
      r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return r.data;
}

export interface ReadResult<T> {
  items: T[];
  /** Records that failed validation; surfaced in diagnostics, never shown as content. */
  invalidCount: number;
}

function validateMany<T>(schema: z.ZodType<T>, values: unknown[]): ReadResult<T> {
  const items: T[] = [];
  let invalidCount = 0;
  for (const v of values) {
    const r = schema.safeParse(v);
    if (r.success) items.push(r.data);
    else invalidCount++;
  }
  return { items, invalidCount };
}

// ---------------------------------------------------------------- sources
export async function putSource(db: DB, source: Source): Promise<void> {
  await db.put('sources', validate(sourceSchema, 'sources', source));
}

export async function getSource(db: DB, id: string): Promise<Source | undefined> {
  const raw = await db.get('sources', id);
  return raw === undefined ? undefined : validate(sourceSchema, 'sources', raw);
}

export async function listSources(db: DB): Promise<ReadResult<Source>> {
  const r = validateMany(sourceSchema, await db.getAll('sources'));
  r.items.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return r;
}

// --------------------------------------------------------------- articles
export async function putArticle(db: DB, article: Article): Promise<void> {
  await db.put('articles', validate(articleSchema, 'articles', article));
}

export async function getArticle(db: DB, id: string): Promise<Article | undefined> {
  const raw = await db.get('articles', id);
  return raw === undefined ? undefined : validate(articleSchema, 'articles', raw);
}

export async function countArticles(db: DB): Promise<number> {
  return db.count('articles');
}

/**
 * Most recently discovered first. Ties are broken by id so ordering is
 * reproducible across runs.
 */
export async function listArticlesByDiscovery(db: DB, limit = 200): Promise<ReadResult<Article>> {
  const raw: unknown[] = [];
  let cursor = await db.transaction('articles').store.index('byFirstSeenAt').openCursor(null, 'prev');
  while (cursor && raw.length < limit) {
    raw.push(cursor.value);
    cursor = await cursor.continue();
  }
  const r = validateMany(articleSchema, raw);
  r.items.sort((a, b) =>
    a.firstSeenAt === b.firstSeenAt ? a.id.localeCompare(b.id) : a.firstSeenAt < b.firstSeenAt ? 1 : -1,
  );
  return r;
}

// ------------------------------------------------------------- user state
function emptyState(articleId: string): ArticleUserState {
  return { articleId, isSaved: false, isRead: false };
}

export async function getUserState(db: DB, articleId: string): Promise<ArticleUserState> {
  const raw = await db.get('userState', articleId);
  return raw === undefined ? emptyState(articleId) : validate(articleUserStateSchema, 'userState', raw);
}

export async function listUserStates(db: DB): Promise<Map<string, ArticleUserState>> {
  const { items } = validateMany(articleUserStateSchema, await db.getAll('userState'));
  return new Map(items.map((s) => [s.articleId, s]));
}

async function updateUserState(
  db: DB,
  articleId: string,
  mutate: (s: ArticleUserState) => ArticleUserState,
): Promise<ArticleUserState> {
  const tx = db.transaction(['userState', 'articles'], 'readwrite');
  if ((await tx.objectStore('articles').getKey(articleId)) === undefined) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new Error(`Unknown article ${articleId}`);
  }
  const store = tx.objectStore('userState');
  const raw = await store.get(articleId);
  const current = raw === undefined ? emptyState(articleId) : validate(articleUserStateSchema, 'userState', raw);
  const next = validate(articleUserStateSchema, 'userState', mutate(current));
  await store.put(next);
  await tx.done;
  return next;
}

export async function setSaved(db: DB, articleId: string, saved: boolean, clock: Clock): Promise<ArticleUserState> {
  return updateUserState(db, articleId, (s) => {
    const { savedAt: _drop, ...rest } = s;
    return saved ? { ...rest, isSaved: true, savedAt: toIsoUtc(clock.now()) } : { ...rest, isSaved: false };
  });
}

export async function setRead(db: DB, articleId: string, read: boolean, clock: Clock): Promise<ArticleUserState> {
  return updateUserState(db, articleId, (s) => {
    const { readAt: _drop, ...rest } = s;
    return read ? { ...rest, isRead: true, readAt: toIsoUtc(clock.now()) } : { ...rest, isRead: false };
  });
}

/** Clears local reading history (read flags), keeping saved items. */
export async function clearReadingHistory(db: DB): Promise<number> {
  const tx = db.transaction('userState', 'readwrite');
  let cleared = 0;
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const s = cursor.value;
    if (s.isRead) {
      const { readAt: _drop, ...rest } = s;
      const next: ArticleUserState = { ...rest, isRead: false };
      if (!next.isSaved && next.categoryOverride === undefined) await cursor.delete();
      else await cursor.update(next);
      cleared++;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return cleared;
}

// ------------------------------------------------------------- categories
export async function listCategories(db: DB): Promise<ReadResult<Category>> {
  const r = validateMany(categorySchema, await db.getAll('categories'));
  r.items.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return r;
}

export async function putCategory(db: DB, category: Category): Promise<void> {
  await db.put('categories', validate(categorySchema, 'categories', category));
}

// --------------------------------------------------------------- settings
export async function getSettings(db: DB): Promise<Settings> {
  const rec = await db.get('meta', 'settings');
  if (rec === undefined) return { ...DEFAULT_SETTINGS };
  const r = settingsSchema.safeParse(rec.value);
  return r.success ? r.data : { ...DEFAULT_SETTINGS };
}

export async function putSettings(db: DB, settings: Settings): Promise<void> {
  await db.put('meta', { key: 'settings', value: validate(settingsSchema, 'settings', settings) });
}

// ------------------------------------------------------- retention/delete
/**
 * Deletes articles first seen before the retention cut-off. Saved articles
 * are kept when `keepSavedOnPurge` is true. Runs in one transaction: either
 * every related record is removed or none is.
 */
export async function purgeExpiredArticles(db: DB, settings: Settings, clock: Clock): Promise<number> {
  const cutoff = toIsoUtc(new Date(clock.now().getTime() - settings.retentionDays * 86_400_000));
  const tx = db.transaction(['articles', 'userState', 'sourceItems'], 'readwrite');
  const articles = tx.objectStore('articles');
  const userState = tx.objectStore('userState');
  const items = tx.objectStore('sourceItems');
  let removed = 0;
  let cursor = await articles.index('byFirstSeenAt').openCursor(IDBKeyRange.upperBound(cutoff, true));
  while (cursor) {
    const articleId = cursor.value.id;
    const state = await userState.get(articleId);
    if (!(settings.keepSavedOnPurge && state?.isSaved)) {
      await cursor.delete();
      await userState.delete(articleId);
      for (const key of await items.index('byArticleId').getAllKeys(articleId)) await items.delete(key);
      removed++;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return removed;
}

/**
 * Erases every user record and restores the initial state (default
 * categories, schema version marker) in the same transaction.
 */
export async function deleteAllData(db: DB): Promise<void> {
  const names = [
    'sources',
    'articles',
    'sourceItems',
    'userState',
    'fetchAttempts',
    'categories',
    'clusters',
    'trendSignals',
    'dedupCandidates',
    'meta',
  ] as const;
  const tx = db.transaction([...names], 'readwrite');
  await Promise.all(names.map((n) => tx.objectStore(n).clear()));
  for (const c of defaultCategories()) await tx.objectStore('categories').put(c);
  await tx.objectStore('meta').put({ key: 'schemaVersion', value: DB_VERSION });
  await tx.done;
}

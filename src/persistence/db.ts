/**
 * IndexedDB schema, versioned migrations and connection handling.
 *
 * IndexedDB is the single storage mechanism (no chrome.storage), so the
 * extension needs no install-time permission. All extension pages share the
 * same origin and therefore the same database.
 */
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import type {
  Article,
  ArticleUserState,
  Category,
  FetchAttempt,
  Source,
  TopicCluster,
  TrendSignal,
} from '../domain/content.types';
import { defaultCategories } from '../domain/default-categories';

export const DB_NAME = 'trendradar';
export const DB_VERSION = 1;

export interface SourceItemRef {
  sourceId: string;
  externalId: string;
  articleId: string;
}

export interface DedupCandidate {
  id: string;
  articleIds: [string, string];
  reason: string;
  similarity: number;
  createdAt: string;
  status: 'open' | 'dismissed';
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

export interface TrendRadarDB extends DBSchema {
  sources: { key: string; value: Source };
  articles: {
    key: string;
    value: Article;
    indexes: {
      byCanonicalUrl: string;
      byPublishedAt: string;
      byFirstSeenAt: string;
      bySourceId: string;
    };
  };
  sourceItems: { key: [string, string]; value: SourceItemRef; indexes: { byArticleId: string } };
  userState: { key: string; value: ArticleUserState };
  fetchAttempts: { key: number; value: FetchAttempt; indexes: { bySourceId: string; byStartedAt: string } };
  categories: { key: string; value: Category };
  clusters: { key: string; value: TopicCluster };
  trendSignals: { key: string; value: TrendSignal };
  dedupCandidates: { key: string; value: DedupCandidate };
  meta: { key: string; value: MetaRecord };
}

export type DB = IDBPDatabase<TrendRadarDB>;
type UpgradeTx = IDBPTransaction<TrendRadarDB, StoreNames<TrendRadarDB>[], 'versionchange'>;

/**
 * Ordered migrations. Migration N upgrades a database from version N-1 to N.
 * Never edit a released migration; append a new one instead.
 */
export const MIGRATIONS: Record<number, (db: DB, tx: UpgradeTx) => void> = {
  1: (db, tx) => {
    db.createObjectStore('sources', { keyPath: 'id' });

    const articles = db.createObjectStore('articles', { keyPath: 'id' });
    articles.createIndex('byCanonicalUrl', 'canonicalUrl', { unique: true });
    articles.createIndex('byPublishedAt', 'publishedAt');
    articles.createIndex('byFirstSeenAt', 'firstSeenAt');
    articles.createIndex('bySourceId', 'sourceIds', { multiEntry: true });

    const items = db.createObjectStore('sourceItems', { keyPath: ['sourceId', 'externalId'] });
    items.createIndex('byArticleId', 'articleId');

    db.createObjectStore('userState', { keyPath: 'articleId' });

    const attempts = db.createObjectStore('fetchAttempts', { keyPath: 'id', autoIncrement: true });
    attempts.createIndex('bySourceId', 'sourceId');
    attempts.createIndex('byStartedAt', 'startedAt');

    const categories = db.createObjectStore('categories', { keyPath: 'id' });
    for (const c of defaultCategories()) void categories.put(c);

    db.createObjectStore('clusters', { keyPath: 'id' });
    db.createObjectStore('trendSignals', { keyPath: 'clusterId' });
    db.createObjectStore('dedupCandidates', { keyPath: 'id' });
    db.createObjectStore('meta', { keyPath: 'key' });

    void tx.objectStore('meta').put({ key: 'schemaVersion', value: 1 });
  },
};

export interface OpenOptions {
  name?: string;
  version?: number;
  onBlocked?: () => void;
}

export async function openTrendRadarDb(options: OpenOptions = {}): Promise<DB> {
  const name = options.name ?? DB_NAME;
  const version = options.version ?? DB_VERSION;
  return openDB<TrendRadarDB>(name, version, {
    upgrade(db, oldVersion, newVersion, tx) {
      const target = newVersion ?? version;
      for (let v = oldVersion + 1; v <= target; v++) {
        const migrate = MIGRATIONS[v];
        if (!migrate) throw new Error(`Missing migration for version ${v}`);
        migrate(db, tx);
      }
      if (oldVersion > 0) void tx.objectStore('meta').put({ key: 'schemaVersion', value: target });
    },
    blocked() {
      options.onBlocked?.();
    },
    blocking(_current, _next, event) {
      // Another page wants to upgrade: release our connection so it can proceed.
      (event.target as IDBDatabase).close();
    },
  });
}

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unsupported';
  try {
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
}

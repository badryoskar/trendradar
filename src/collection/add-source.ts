/**
 * Adding a feed source. The host permission must be requested by the UI
 * synchronously inside the click handler (user gesture); this module only
 * receives the outcome.
 */
import type { Source } from '../domain/content.types';
import { hackerNewsSource, HN_SOURCE_ID } from '../connectors/hacker-news';
import type { NetworkDeps } from '../connectors/network-client';
import { rssAtomConnector } from '../connectors/rss-atom';
import type { DB } from '../persistence/db';
import { ingestDrafts, stableId } from '../persistence/ingest';
import { putSource } from '../persistence/repositories';
import { recordAttempt } from '../persistence/sources';
import { toIsoUtc } from '../shared/clock';
import { toConnectorError } from '../shared/failures';
import { checkFeedUrl } from '../shared/safe-url';
import { FEED_MAX_ITEMS } from './refresh';

export interface AddFeedInput {
  url: string;
  name?: string;
  categoryIds?: string[];
}

export type AddFeedOutcome =
  | { status: 'added'; source: Source; inserted: number; warnings: string[] }
  | { status: 'permission-needed'; source: Source }
  | { status: 'invalid'; reason: string }
  | { status: 'duplicate'; source: Source }
  | { status: 'failed'; code: string; message: string };

export function feedSourceId(feedUrl: string): string {
  return stableId('s_', feedUrl);
}

export async function addFeedSource(
  db: DB,
  input: AddFeedInput,
  permissionGranted: boolean,
  deps: NetworkDeps,
): Promise<AddFeedOutcome> {
  const check = checkFeedUrl(input.url);
  if (!check.ok) return { status: 'invalid', reason: check.reason };
  const feedUrl = check.url.href;
  const id = feedSourceId(feedUrl);
  const existing = await db.get('sources', id);
  if (existing) return { status: 'duplicate', source: existing };

  const now = toIsoUtc(deps.clock.now());
  const base: Source = {
    id,
    kind: 'feed',
    name: input.name?.trim() || check.url.hostname,
    origin: check.url.origin,
    feedUrl,
    enabled: true,
    health: 'never-fetched',
    attributionUrl: check.url.origin + '/',
    categoryIds: input.categoryIds ?? [],
    createdAt: now,
    consecutiveFailures: 0,
  };

  if (!permissionGranted) {
    const source: Source = {
      ...base,
      health: 'permission-needed',
      lastErrorCode: 'permission',
      lastErrorAt: now,
      lastErrorMessage: 'Accès au site non accordé.',
    };
    await putSource(db, source);
    return { status: 'permission-needed', source };
  }

  // Bounded test collection before saving: an invalid feed is not stored.
  try {
    const res = await rssAtomConnector.fetchLatest(base, { maxItems: FEED_MAX_ITEMS }, deps);
    const endedAt = toIsoUtc(deps.clock.now());
    const source: Source = {
      ...base,
      name: input.name?.trim() || res.feedTitle || check.url.hostname,
      health: 'ok',
      lastAttemptAt: now,
      lastSuccessAt: endedAt,
      ...(res.detectedFormat ? { detectedFormat: res.detectedFormat } : {}),
    };
    await putSource(db, source);
    const ingest = await ingestDrafts(db, source, res.drafts, res.fetchedAt);
    await recordAttempt(db, {
      sourceId: id,
      startedAt: now,
      endedAt,
      success: true,
      fetchedCount: res.drafts.length,
      insertedCount: ingest.inserted,
      ...(ingest.oldestPublishedAt ? { oldestItemPublishedAt: ingest.oldestPublishedAt } : {}),
    });
    return { status: 'added', source, inserted: ingest.inserted, warnings: res.warnings };
  } catch (err) {
    const e = toConnectorError(err);
    return { status: 'failed', code: e.code, message: e.message };
  }
}

/** Adds the official HN source (no host permission needed: permissive CORS). */
export async function addHackerNews(db: DB, deps: Pick<NetworkDeps, 'clock'>): Promise<Source> {
  const existing = await db.get('sources', HN_SOURCE_ID);
  if (existing) return existing;
  const source = hackerNewsSource(toIsoUtc(deps.clock.now()));
  await putSource(db, source);
  return source;
}

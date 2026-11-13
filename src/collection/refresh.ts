/**
 * Manual refresh orchestration. Each source is collected and persisted
 * independently: one failing source never blocks the others, and data
 * already stored is kept when a source fails.
 */
import type { FetchErrorCode, Source } from '../domain/content.types';
import { hackerNewsConnector } from '../connectors/hacker-news';
import { mapWithConcurrency, type NetworkDeps } from '../connectors/network-client';
import { rssAtomConnector } from '../connectors/rss-atom';
import type { SourceConnector } from '../connectors/source-connector';
import type { DB } from '../persistence/db';
import { ingestDrafts } from '../persistence/ingest';
import { recordAttempt, updateSource } from '../persistence/sources';
import { toIsoUtc } from '../shared/clock';
import { ConnectorError, toConnectorError } from '../shared/failures';
import { originPattern } from '../shared/safe-url';

export const SOURCE_CONCURRENCY = 4;
export const FEED_MAX_ITEMS = 50;
/** Backoff steps after consecutive throttling/server failures. */
const BACKOFF_MS = [3_600_000, 4 * 3_600_000, 24 * 3_600_000];

const CONNECTORS: Record<Source['kind'], SourceConnector> = {
  'hacker-news': hackerNewsConnector,
  feed: rssAtomConnector,
};

export type SourceRunState =
  | { status: 'running' }
  | { status: 'ok'; inserted: number; updated: number; warnings: number }
  | { status: 'error'; code: FetchErrorCode; message: string }
  | { status: 'skipped'; reason: 'disabled' | 'demo' | 'backoff'; until?: string };

export interface RefreshReport {
  startedAt: string;
  endedAt: string;
  results: Record<string, SourceRunState>;
}

export async function refreshSources(
  db: DB,
  sources: Source[],
  deps: NetworkDeps,
  opts: { signal?: AbortSignal; onProgress?: (sourceId: string, state: SourceRunState) => void } = {},
): Promise<RefreshReport> {
  const startedAt = toIsoUtc(deps.clock.now());
  const results: Record<string, SourceRunState> = {};
  const report = (id: string, s: SourceRunState) => {
    results[id] = s;
    opts.onProgress?.(id, s);
  };

  await mapWithConcurrency(sources, SOURCE_CONCURRENCY, async (source) => {
    if (source.isDemo) return report(source.id, { status: 'skipped', reason: 'demo' });
    if (!source.enabled) return report(source.id, { status: 'skipped', reason: 'disabled' });
    const now = deps.clock.now();
    if (source.backoffUntil && source.backoffUntil > toIsoUtc(now)) {
      return report(source.id, { status: 'skipped', reason: 'backoff', until: source.backoffUntil });
    }
    report(source.id, { status: 'running' });
    report(source.id, await collectOne(db, source, deps, opts.signal));
  });

  return { startedAt, endedAt: toIsoUtc(deps.clock.now()), results };
}

export async function collectOne(
  db: DB,
  source: Source,
  deps: NetworkDeps,
  signal?: AbortSignal,
): Promise<SourceRunState> {
  const startedAt = toIsoUtc(deps.clock.now());
  await updateSource(db, source.id, (s) => ({ ...s, lastAttemptAt: startedAt }));
  try {
    if (source.kind === 'feed') {
      const pattern = originPattern(new URL(source.feedUrl ?? source.origin));
      if (!(await deps.permissions.contains(pattern))) {
        throw new ConnectorError('permission', 'Accès au site non accordé.');
      }
    }
    const connector = CONNECTORS[source.kind];
    const res = await connector.fetchLatest(source, { signal, maxItems: FEED_MAX_ITEMS }, deps);
    const ingest = await ingestDrafts(db, source, res.drafts, res.fetchedAt);
    const endedAt = toIsoUtc(deps.clock.now());
    await updateSource(db, source.id, (s) => {
      const { lastErrorCode: _c, lastErrorMessage: _m, backoffUntil: _b, ...rest } = s;
      return {
        ...rest,
        health: 'ok',
        lastSuccessAt: endedAt,
        consecutiveFailures: 0,
        ...(res.detectedFormat ? { detectedFormat: res.detectedFormat } : {}),
      };
    });
    await recordAttempt(db, {
      sourceId: source.id,
      startedAt,
      endedAt,
      success: true,
      fetchedCount: res.drafts.length,
      insertedCount: ingest.inserted,
      ...(ingest.oldestPublishedAt ? { oldestItemPublishedAt: ingest.oldestPublishedAt } : {}),
    });
    return { status: 'ok', inserted: ingest.inserted, updated: ingest.updated, warnings: res.warnings.length };
  } catch (thrown) {
    const err = toConnectorError(thrown);
    const { code, message } = err;
    const endedAt = toIsoUtc(deps.clock.now());
    await updateSource(db, source.id, (s) => {
      const failures = s.consecutiveFailures + 1;
      const throttled = code === 'rate-limit' || (code === 'http' && (err.statusCode ?? 0) >= 500);
      let backoffUntil: string | undefined;
      if (throttled) {
        const step = BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)]!;
        const computed = toIsoUtc(new Date(deps.clock.now().getTime() + step));
        backoffUntil = err.retryAfter && err.retryAfter > computed ? err.retryAfter : computed;
      }
      const { backoffUntil: _old, ...rest } = s;
      return {
        ...rest,
        health:
          code === 'permission'
            ? 'permission-needed'
            : throttled
              ? 'backoff'
              : code === 'aborted'
                ? 'interrupted'
                : 'error',
        lastErrorAt: endedAt,
        lastErrorCode: code,
        lastErrorMessage: message.slice(0, 500),
        consecutiveFailures: failures,
        ...(backoffUntil ? { backoffUntil } : {}),
      };
    });
    await recordAttempt(db, {
      sourceId: source.id,
      startedAt,
      endedAt,
      success: false,
      fetchedCount: 0,
      insertedCount: 0,
      errorCode: code,
      ...(err.statusCode ? { statusCode: err.statusCode } : {}),
      ...(err.retryAfter ? { retryAfter: err.retryAfter } : {}),
    });
    return { status: 'error', code, message };
  }
}

/**
 * Transactional ingestion with deterministic deduplication.
 *
 * Order of identity resolution (see TREND_METHOD / DATA docs):
 *  1. exact (sourceId, externalId) already seen  -> same article;
 *  2. same canonical URL (any source)            -> same article, provenance appended;
 *  3. otherwise                                  -> new article (id derived from canonical URL).
 * Title similarity is NEVER used to merge here (only to propose candidates later).
 *
 * Invariants: replaying the same batch is idempotent; provenance is never
 * overwritten; user state (read/saved) is never touched; a known source date
 * is never replaced by the collection time.
 */
import { articleSchema, type Article, type Source } from '../domain/content.types';
import { canonicalizeUrl } from '../domain/canonicalize-url';
import type { ArticleDraft } from '../connectors/source-connector';
import type { DB } from './db';

export interface IngestResult {
  inserted: number;
  updated: number;
  skipped: number;
  /** Oldest declared source date in the batch (drives window coverage). */
  oldestPublishedAt: string | undefined;
}

/** FNV-1a 64-bit, hex. Deterministic ids make replays idempotent. */
export function stableId(prefix: string, input: string): string {
  let h = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(input);
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `${prefix}${h.toString(16).padStart(16, '0')}`;
}

const maxIso = (a: string | undefined, b: string | undefined) =>
  a === undefined ? b : b === undefined ? a : a > b ? a : b;
const minIso = (a: string | undefined, b: string | undefined) =>
  a === undefined ? b : b === undefined ? a : a < b ? a : b;

function temporalQualityOf(a: Pick<Article, 'publishedAt' | 'updatedAt'>): Article['temporalQuality'] {
  return a.publishedAt ? 'source-published' : a.updatedAt ? 'source-updated' : 'unknown';
}

export async function ingestDrafts(
  db: DB,
  source: Source,
  drafts: ArticleDraft[],
  fetchedAt: string,
): Promise<IngestResult> {
  const result: IngestResult = { inserted: 0, updated: 0, skipped: 0, oldestPublishedAt: undefined };
  const tx = db.transaction(['articles', 'sourceItems'], 'readwrite');
  const articles = tx.objectStore('articles');
  const items = tx.objectStore('sourceItems');

  for (const d of drafts) {
    const canonicalUrl = canonicalizeUrl(d.url);
    if (!canonicalUrl) {
      result.skipped++;
      continue;
    }
    result.oldestPublishedAt = minIso(result.oldestPublishedAt, d.publishedAt);

    let existing: Article | undefined;
    if (d.externalId !== undefined) {
      const ref = await items.get([source.id, d.externalId]);
      if (ref) existing = await articles.get(ref.articleId);
    }
    existing ??= await articles.index('byCanonicalUrl').get(canonicalUrl);

    const metrics = d.metrics?.map((m) => ({ ...m, capturedAt: fetchedAt }));
    let next: Article;
    if (existing) {
      const provenance = existing.provenance.map((p) => ({ ...p }));
      const mine = provenance.find(
        (p) =>
          p.sourceId === source.id &&
          (d.externalId === undefined || p.externalId === undefined || p.externalId === d.externalId),
      );
      if (mine) {
        mine.lastSeenAt = maxIso(mine.lastSeenAt, fetchedAt)!;
        if (metrics) mine.metrics = metrics;
        if (mine.externalId === undefined && d.externalId !== undefined) mine.externalId = d.externalId;
      } else {
        provenance.push({
          sourceId: source.id,
          ...(d.externalId !== undefined ? { externalId: d.externalId } : {}),
          originalUrl: d.url,
          firstSeenAt: fetchedAt,
          lastSeenAt: fetchedAt,
          ...(metrics ? { metrics } : {}),
        });
      }
      next = {
        ...existing,
        provenance,
        sourceIds: [...new Set(provenance.map((p) => p.sourceId))],
        lastSeenAt: maxIso(existing.lastSeenAt, fetchedAt)!,
        fetchedAt: maxIso(existing.fetchedAt, fetchedAt)!,
        autoCategories: [...new Set([...existing.autoCategories, ...source.categoryIds])],
      };
      // Fill gaps only; never overwrite a date already observed.
      if (next.publishedAt === undefined && d.publishedAt !== undefined) next.publishedAt = d.publishedAt;
      const upd = maxIso(next.updatedAt, d.updatedAt);
      if (upd !== undefined) next.updatedAt = upd;
      if (next.excerpt === undefined && d.excerpt !== undefined) {
        next.excerpt = d.excerpt;
        next.excerptOrigin = d.excerptOrigin ?? 'feed';
      }
      next.temporalQuality = temporalQualityOf(next);
    } else {
      next = {
        id: stableId('a_', canonicalUrl),
        title: d.title,
        canonicalUrl,
        provenance: [
          {
            sourceId: source.id,
            ...(d.externalId !== undefined ? { externalId: d.externalId } : {}),
            originalUrl: d.url,
            firstSeenAt: fetchedAt,
            lastSeenAt: fetchedAt,
            ...(metrics ? { metrics } : {}),
          },
        ],
        sourceIds: [source.id],
        ...(d.publishedAt !== undefined ? { publishedAt: d.publishedAt } : {}),
        ...(d.updatedAt !== undefined ? { updatedAt: d.updatedAt } : {}),
        temporalQuality: 'unknown',
        firstSeenAt: fetchedAt,
        lastSeenAt: fetchedAt,
        fetchedAt,
        autoCategories: [...source.categoryIds],
        ...(d.excerpt !== undefined ? { excerpt: d.excerpt, excerptOrigin: d.excerptOrigin ?? 'feed' } : {}),
        ...(d.byline !== undefined ? { byline: d.byline } : {}),
        ...(d.language !== undefined ? { language: d.language } : {}),
      };
      next.temporalQuality = temporalQualityOf(next);
    }

    const valid = articleSchema.safeParse(next);
    if (!valid.success) {
      result.skipped++;
      continue;
    }
    await articles.put(valid.data);
    if (d.externalId !== undefined)
      await items.put({ sourceId: source.id, externalId: d.externalId, articleId: valid.data.id });
    if (existing) result.updated++;
    else result.inserted++;
  }
  await tx.done;
  return result;
}

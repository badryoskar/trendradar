/**
 * Connector contract. A connector turns one Source into validated
 * ArticleDrafts, or throws a typed ConnectorError. Connectors never touch
 * storage; ingestion (dedup, provenance merge) is done by the persistence
 * layer in a single transaction.
 */
import { z } from 'zod';
import type { FeedFormat, Source, SourceKind } from '../domain/content.types';
import type { NetworkDeps } from './network-client';

const httpUrl = z.string().refine((s) => {
  try {
    const p = new URL(s).protocol;
    return p === 'https:' || p === 'http:';
  } catch {
    return false;
  }
});
const iso = z.string().regex(/Z$/);

export const articleDraftSchema = z.object({
  externalId: z.string().min(1).max(500).optional(),
  title: z.string().min(1).max(1000),
  url: httpUrl,
  publishedAt: iso.optional(),
  updatedAt: iso.optional(),
  excerpt: z.string().min(1).max(2000).optional(),
  excerptOrigin: z.enum(['feed', 'api']).optional(),
  byline: z.string().min(1).max(300).optional(),
  language: z.string().min(1).max(35).optional(),
  metrics: z.array(z.object({ metric: z.string(), value: z.number().finite() })).optional(),
});
export type ArticleDraft = z.infer<typeof articleDraftSchema>;

export interface FetchLatestOptions {
  signal?: AbortSignal | undefined;
  maxItems: number;
}

export interface FetchLatestResult {
  drafts: ArticleDraft[];
  fetchedAt: string;
  /** Short codes/messages (e.g. "item-skipped:no-title"); no content. */
  warnings: string[];
  detectedFormat?: FeedFormat;
  /** Final URL after redirects (feeds only). */
  finalUrl?: string;
  /** Title declared by the feed itself, used as a default source name. */
  feedTitle?: string;
}

export interface SourceConnector {
  kind: SourceKind;
  checkConfiguration(source: Source): { ok: boolean; issues: string[] };
  fetchLatest(source: Source, options: FetchLatestOptions, deps: NetworkDeps): Promise<FetchLatestResult>;
}

/** Validates drafts, dropping invalid ones with a warning. */
export function validDrafts(candidates: unknown[], warnings: string[]): ArticleDraft[] {
  const out: ArticleDraft[] = [];
  for (const c of candidates) {
    const r = articleDraftSchema.safeParse(c);
    if (r.success) out.push(r.data);
    else warnings.push('item-skipped:invalid');
  }
  return out;
}

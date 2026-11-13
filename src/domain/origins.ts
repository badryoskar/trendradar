import type { Provenance } from './content.types';

/** Must match HN_SOURCE_ID in connectors/hacker-news.ts (kept here to avoid a domain -> connector import). */
export const AGGREGATOR_SOURCE_IDS: Record<string, string> = { 'hacker-news': 'news.ycombinator.com' };

/**
 * Publishing origin used for diversity counts. An aggregator (Hacker News)
 * counts as ONE origin regardless of the sites its items link to, so a
 * single aggregator can never fake source diversity.
 */
export function provenanceOrigin(p: Pick<Provenance, 'sourceId' | 'originalUrl'>): string {
  const agg = AGGREGATOR_SOURCE_IDS[p.sourceId];
  if (agg) return agg;
  try {
    return new URL(p.originalUrl).hostname.replace(/^www\./, '');
  } catch {
    return p.originalUrl;
  }
}

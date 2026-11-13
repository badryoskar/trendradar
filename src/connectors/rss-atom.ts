import type { Source } from '../domain/content.types';
import { checkFeedUrl } from '../shared/safe-url';
import { toIsoUtc } from '../shared/clock';
import { ConnectorError } from '../shared/failures';
import { parseFeed } from './feed-parser';
import { fetchResource } from './network-client';
import { validDrafts, type SourceConnector } from './source-connector';

export const rssAtomConnector: SourceConnector = {
  kind: 'feed',

  checkConfiguration(source) {
    const issues: string[] = [];
    if (source.kind !== 'feed') issues.push('Type de source incorrect.');
    if (!source.feedUrl) issues.push('URL du flux manquante.');
    else {
      const r = checkFeedUrl(source.feedUrl);
      if (!r.ok) issues.push(r.reason);
    }
    return { ok: issues.length === 0, issues };
  },

  async fetchLatest(source: Source, options, deps) {
    const config = this.checkConfiguration(source);
    if (!config.ok || !source.feedUrl) throw new ConnectorError('other', config.issues.join(' '));
    const res = await fetchResource(source.feedUrl, { expect: 'xml', signal: options.signal }, deps);
    const fetchedAt = toIsoUtc(deps.clock.now());
    const feed = parseFeed(res.text, res.finalUrl, deps.clock.now(), options.maxItems);
    const warnings = [...feed.warnings];
    const drafts = validDrafts(
      feed.items
        .map((i) => ({
          externalId: i.externalId,
          title: i.title,
          url: i.url,
          publishedAt: i.publishedAt,
          updatedAt: i.updatedAt,
          excerpt: i.excerpt,
          excerptOrigin: i.excerpt !== undefined ? 'feed' : undefined,
          byline: i.byline,
          language: feed.language,
        }))
        .map(dropUndefined),
      warnings,
    );
    return {
      drafts,
      fetchedAt,
      warnings,
      detectedFormat: feed.format,
      finalUrl: res.finalUrl,
      ...(feed.title ? { feedTitle: feed.title } : {}),
    };
  },
};

function dropUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

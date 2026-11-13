/**
 * Deterministic topic clustering of article titles (rule version 1).
 * No machine learning, no generated text. See TREND_METHOD.md.
 *
 * 1. Tokens: normalised title (NFKD, no accents, lower-case, punctuation as
 *    spaces); stopwords removed; words of >= 3 letters and numbers of >= 2
 *    digits kept; a trailing "s" is dropped on words of >= 5 letters
 *    (light, documented plural folding).
 * 2. Similarity of two titles: Jaccard index of their token sets.
 * 3. An article joins a cluster only if, against the cluster SEED (its
 *    first article): Jaccard >= 0.5 AND >= 2 shared non-generic tokens;
 *    and its reference time is within 72 h of the cluster's latest member.
 *    Anchoring on the seed prevents drift ("giant clusters"); chaining in
 *    time lets a topic covered regularly stay one cluster.
 * 4. Ties: the cluster with the highest similarity wins, then the oldest.
 * 5. Label = real title of the medoid (member with the highest summed
 *    similarity to the others; ties -> earliest, then id).
 * Input order does not matter: articles are processed by reference time
 * (publishedAt if declared, else firstSeenAt), then id.
 */
import type { Article, TopicCluster } from './content.types';
import { normalizeForMatch } from './classify';
import { provenanceOrigin } from './origins';
import { GENERIC_TERMS, STOPWORDS, STOPWORDS_VERSION } from './stopwords';

export const CLUSTERING_RULE_VERSION = `1+sw${STOPWORDS_VERSION}`;
export const MIN_JACCARD = 0.5;
export const MIN_SHARED_SPECIFIC = 2;
export const MAX_GAP_HOURS = 72;

export function titleTokens(title: string): string[] {
  const out = new Set<string>();
  for (const raw of normalizeForMatch(title).trim().split(' ')) {
    if (raw === '' || STOPWORDS.has(raw)) continue;
    const isNumber = /^\d+$/.test(raw);
    if (isNumber ? raw.length < 2 : raw.length < 3) continue;
    const token = !isNumber && raw.length >= 5 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw;
    if (!STOPWORDS.has(token)) out.add(token);
  }
  return [...out].sort();
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const sb = new Set(b);
  let inter = 0;
  for (const t of a) if (sb.has(t)) inter++;
  return inter / (a.length + b.length - inter);
}

export function sharedSpecific(a: string[], b: string[]): string[] {
  const sb = new Set(b);
  return a.filter((t) => sb.has(t) && !GENERIC_TERMS.has(t));
}

export function similar(a: string[], b: string[]): { ok: boolean; jaccard: number; shared: string[] } {
  const j = jaccard(a, b);
  const shared = sharedSpecific(a, b);
  return { ok: j >= MIN_JACCARD && shared.length >= MIN_SHARED_SPECIFIC, jaccard: j, shared };
}

export function referenceTime(a: Pick<Article, 'publishedAt' | 'firstSeenAt'>): string {
  return a.publishedAt ?? a.firstSeenAt;
}

interface Working {
  seed: Article;
  seedTokens: string[];
  members: Article[];
  latest: number;
}

export function clusterArticles(articles: Article[]): TopicCluster[] {
  const ordered = [...articles].sort((a, b) => {
    const ta = referenceTime(a);
    const tb = referenceTime(b);
    return ta === tb ? a.id.localeCompare(b.id) : ta < tb ? -1 : 1;
  });
  const tokens = new Map(ordered.map((a) => [a.id, titleTokens(a.title)]));
  const clusters: Working[] = [];
  const maxGap = MAX_GAP_HOURS * 3_600_000;

  for (const a of ordered) {
    const t = Date.parse(referenceTime(a));
    const toks = tokens.get(a.id)!;
    let best: { c: Working; j: number } | null = null;
    for (const c of clusters) {
      if (t - c.latest > maxGap) continue;
      const s = similar(toks, c.seedTokens);
      if (s.ok && (best === null || s.jaccard > best.j)) best = { c, j: s.jaccard };
    }
    if (best) {
      best.c.members.push(a);
      best.c.latest = Math.max(best.c.latest, t);
    } else {
      clusters.push({ seed: a, seedTokens: toks, members: [a], latest: t });
    }
  }

  return clusters.map((c) => finalize(c, tokens));
}

function finalize(c: Working, tokens: Map<string, string[]>): TopicCluster {
  const members = c.members;
  let medoid = members[0]!;
  let bestScore = -1;
  for (const m of members) {
    const tm = tokens.get(m.id)!;
    let score = 0;
    for (const o of members) if (o !== m) score += jaccard(tm, tokens.get(o.id)!);
    if (score > bestScore) {
      bestScore = score;
      medoid = m;
    }
  }
  const counts = new Map<string, number>();
  for (const m of members) for (const tk of tokens.get(m.id)!) counts.set(tk, (counts.get(tk) ?? 0) + 1);
  const sharedTerms = [...counts.entries()]
    .filter(([tk, n]) => n >= 2 && n * 2 >= members.length && !GENERIC_TERMS.has(tk))
    .map(([tk]) => tk)
    .sort();
  const times = members.map(referenceTime).sort();
  const sourceIds = [...new Set(members.flatMap((m) => m.sourceIds))].sort();
  const origins = [...new Set(members.flatMap((m) => m.provenance.map(provenanceOrigin)))].sort();
  return {
    id: `c_${c.seed.id}`,
    label: medoid.title,
    medoidArticleId: medoid.id,
    articleIds: members.map((m) => m.id),
    firstObservedAt: times[0]!,
    lastObservedAt: times.at(-1)!,
    distinctSourceIds: sourceIds,
    distinctOrigins: origins,
    sharedTerms,
    clusteringRuleVersion: CLUSTERING_RULE_VERSION,
  };
}

/**
 * Topic analysis entry point: clusters the last 14 days of articles and
 * attaches a signal to every multi-article cluster. Computed at read time
 * so the result always reflects the current rule versions (no stale
 * stored scores).
 */
import type { Article, FetchAttempt, Source, TopicCluster, TrendSignal } from './content.types';
import { CLUSTERING_RULE_VERSION, clusterArticles, referenceTime } from './topic-cluster';
import {
  RECURRING_LOOKBACK_DAYS,
  TREND_RULE_VERSION,
  computeCoverage,
  computeSignal,
  type CoverageReport,
} from './trend-signal';

export interface TopicEntry {
  cluster: TopicCluster;
  signal: TrendSignal;
}

export interface TopicAnalysis {
  coverage: CoverageReport;
  topics: TopicEntry[];
  analysedArticles: number;
  clusteringRuleVersion: string;
  trendRuleVersion: string;
}

const STATUS_RANK: Record<TrendSignal['status'], number> = { emerging: 0, recurring: 1, 'insufficient-data': 2 };

export function analyzeTopics(
  articles: Article[],
  attempts: FetchAttempt[],
  sources: Source[],
  now: Date,
): TopicAnalysis {
  const since = now.getTime() - RECURRING_LOOKBACK_DAYS * 86_400_000;
  const scope = articles.filter((a) => {
    const t = Date.parse(referenceTime(a));
    return t >= since && t <= now.getTime() + 86_400_000;
  });
  const byId = new Map(scope.map((a) => [a.id, a]));
  const coverage = computeCoverage(attempts, sources, now);
  const topics = clusterArticles(scope)
    .filter((c) => c.articleIds.length >= 2)
    .map((cluster) => ({ cluster, signal: computeSignal(cluster, byId, coverage, now) }))
    .sort(
      (x, y) =>
        STATUS_RANK[x.signal.status] - STATUS_RANK[y.signal.status] ||
        y.cluster.articleIds.length - x.cluster.articleIds.length ||
        (x.cluster.lastObservedAt < y.cluster.lastObservedAt
          ? 1
          : x.cluster.lastObservedAt > y.cluster.lastObservedAt
            ? -1
            : 0) ||
        x.cluster.id.localeCompare(y.cluster.id),
    );
  return {
    coverage,
    topics,
    analysedArticles: scope.length,
    clusteringRuleVersion: CLUSTERING_RULE_VERSION,
    trendRuleVersion: TREND_RULE_VERSION,
  };
}

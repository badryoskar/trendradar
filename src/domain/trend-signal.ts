/**
 * Conditional trend signals (rule version 1). See TREND_METHOD.md.
 *
 * Windows (UTC, half-open): recent = [now-24h, now), baseline =
 * [now-7d, now-24h). Counts use DECLARED publication dates only; undated
 * members are reported separately and never counted.
 *
 * Coverage: a source covers a window if the union of the intervals
 * [oldestItemPublishedAt, endedAt] of its successful fetch attempts spans
 * [window.start, window.end - 6h]. A window is covered when at least 3
 * distinct sources cover it. Only RSS/Atom feeds (chronological) count;
 * HN rankings and demo sources never prove coverage. Diversity counts
 * publishing origins, an aggregator counting as one origin.
 *
 * Status (first matching rule):
 *  - emerging: both windows covered, recent count >= 3, >= 3 distinct
 *    origins among recent articles, and
 *    ratio = recent / ((baseline + 1) / 6) >= 3   (daily rate vs smoothed baseline daily rate);
 *  - recurring: members published on >= 3 distinct UTC days within the last
 *    14 days, from >= 2 distinct origins (observed repetition only);
 *  - otherwise insufficient-data, with reason codes.
 * The HN score is never used. `score` is the ratio, only when both windows
 * are covered.
 */
import type { Article, FetchAttempt, Source, TopicCluster, TrendSignal } from './content.types';
import { toIsoUtc } from '../shared/clock';
import { provenanceOrigin } from './origins';

export const TREND_RULE_VERSION = '1';
export const RECENT_HOURS = 24;
export const BASELINE_DAYS = 6;
export const COVERAGE_TOLERANCE_HOURS = 6;
export const MIN_COVERING_SOURCES = 3;
export const MIN_RECENT_ARTICLES = 3;
export const MIN_RECENT_ORIGINS = 3;
export const MIN_RATIO = 3;
export const RECURRING_LOOKBACK_DAYS = 14;
export const MIN_RECURRING_DAYS = 3;
export const MIN_RECURRING_ORIGINS = 2;

const H = 3_600_000;

export interface Windows {
  recent: { start: number; end: number };
  baseline: { start: number; end: number };
}

export function trendWindows(now: Date): Windows {
  const end = now.getTime();
  const recentStart = end - RECENT_HOURS * H;
  return {
    recent: { start: recentStart, end },
    baseline: { start: recentStart - BASELINE_DAYS * 24 * H, end: recentStart },
  };
}

/** Does the union of [from, to] intervals cover [start, end]? */
export function intervalsCover(intervals: Array<[number, number]>, start: number, end: number): boolean {
  if (end <= start) return true;
  const sorted = intervals.filter(([a, b]) => b >= a).sort((x, y) => x[0] - y[0]);
  let reach = start;
  for (const [a, b] of sorted) {
    if (a > reach) break;
    reach = Math.max(reach, b);
    if (reach >= end) return true;
  }
  return reach >= end;
}

export interface CoverageReport {
  recentSources: string[];
  baselineSources: string[];
  recentCovered: boolean;
  baselineCovered: boolean;
}

export function computeCoverage(attempts: FetchAttempt[], sources: Source[], now: Date): CoverageReport {
  const w = trendWindows(now);
  // Only chronological feeds can prove coverage: an HN ranking is not an
  // exhaustive list of what was published between its oldest item and now.
  const eligible = new Set(sources.filter((s) => !s.isDemo && s.kind === 'feed').map((s) => s.id));
  const bySource = new Map<string, Array<[number, number]>>();
  for (const a of attempts) {
    if (!a.success || !a.endedAt || !a.oldestItemPublishedAt || !eligible.has(a.sourceId)) continue;
    const list = bySource.get(a.sourceId) ?? [];
    list.push([Date.parse(a.oldestItemPublishedAt), Date.parse(a.endedAt)]);
    bySource.set(a.sourceId, list);
  }
  const tol = COVERAGE_TOLERANCE_HOURS * H;
  const recentSources: string[] = [];
  const baselineSources: string[] = [];
  for (const [id, intervals] of [...bySource.entries()].sort(([x], [y]) => x.localeCompare(y))) {
    if (intervalsCover(intervals, w.recent.start, w.recent.end - tol)) recentSources.push(id);
    if (intervalsCover(intervals, w.baseline.start, w.baseline.end - tol)) baselineSources.push(id);
  }
  return {
    recentSources,
    baselineSources,
    recentCovered: recentSources.length >= MIN_COVERING_SOURCES,
    baselineCovered: baselineSources.length >= MIN_COVERING_SOURCES,
  };
}

function originsOf(articles: Article[]): Set<string> {
  return new Set(articles.flatMap((a) => a.provenance.map(provenanceOrigin)));
}

export function computeSignal(
  cluster: TopicCluster,
  articlesById: Map<string, Article>,
  coverage: CoverageReport,
  now: Date,
): TrendSignal {
  const w = trendWindows(now);
  const members = cluster.articleIds.map((id) => articlesById.get(id)).filter((a): a is Article => a !== undefined);
  const dated = members.filter((a) => a.publishedAt !== undefined);
  const undated = members.length - dated.length;
  const t = (a: Article) => Date.parse(a.publishedAt!);
  const recent = dated.filter((a) => t(a) >= w.recent.start && t(a) < w.recent.end);
  const baseline = dated.filter((a) => t(a) >= w.baseline.start && t(a) < w.baseline.end);
  const recentOrigins = originsOf(recent);
  const reasons: string[] = [];

  const ratio = recent.length / ((baseline.length + 1) / BASELINE_DAYS);
  const bothCovered = coverage.recentCovered && coverage.baselineCovered;
  if (!coverage.recentCovered)
    reasons.push(`recent-not-covered:${coverage.recentSources.length}/${MIN_COVERING_SOURCES}`);
  if (!coverage.baselineCovered)
    reasons.push(`baseline-not-covered:${coverage.baselineSources.length}/${MIN_COVERING_SOURCES}`);
  if (recent.length < MIN_RECENT_ARTICLES)
    reasons.push(`too-few-recent-articles:${recent.length}/${MIN_RECENT_ARTICLES}`);
  if (recentOrigins.size < MIN_RECENT_ORIGINS)
    reasons.push(`too-few-recent-origins:${recentOrigins.size}/${MIN_RECENT_ORIGINS}`);
  if (bothCovered && ratio < MIN_RATIO) reasons.push(`ratio-below-threshold:${ratio.toFixed(2)}<${MIN_RATIO}`);
  if (undated > 0) reasons.push(`undated-excluded:${undated}`);

  const emerging =
    bothCovered &&
    recent.length >= MIN_RECENT_ARTICLES &&
    recentOrigins.size >= MIN_RECENT_ORIGINS &&
    ratio >= MIN_RATIO;

  const lookbackStart = now.getTime() - RECURRING_LOOKBACK_DAYS * 24 * H;
  const lookback = dated.filter((a) => t(a) >= lookbackStart && t(a) < now.getTime());
  const days = new Set(lookback.map((a) => a.publishedAt!.slice(0, 10)));
  const recurring = days.size >= MIN_RECURRING_DAYS && originsOf(lookback).size >= MIN_RECURRING_ORIGINS;

  let status: TrendSignal['status'] = 'insufficient-data';
  if (emerging) {
    status = 'emerging';
    reasons.unshift('emerging');
  } else if (recurring) {
    status = 'recurring';
    reasons.unshift(`recurring:days=${days.size}`);
  }

  const iso = (ms: number) => toIsoUtc(new Date(ms));
  return {
    clusterId: cluster.id,
    measuredAt: toIsoUtc(now),
    ruleVersion: TREND_RULE_VERSION,
    status,
    recentWindow: {
      start: iso(w.recent.start),
      end: iso(w.recent.end),
      count: recent.length,
      covered: coverage.recentCovered,
    },
    baselineWindow: {
      start: iso(w.baseline.start),
      end: iso(w.baseline.end),
      count: baseline.length,
      covered: coverage.baselineCovered,
    },
    distinctSources: new Set(members.flatMap((a) => a.sourceIds)).size,
    distinctOrigins: recentOrigins.size,
    undatedArticles: undated,
    reasonCodes: reasons,
    ...(bothCovered ? { score: Math.round(ratio * 100) / 100 } : {}),
  };
}

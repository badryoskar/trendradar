/**
 * Date semantics shown to the user. The collection time is NEVER used as a
 * stand-in for the publication time.
 */
import type { Article } from './content.types';

export interface ArticleDates {
  /** Publication (or update) date declared by the source, if any. */
  sourceDate: { kind: 'published' | 'updated'; iso: string } | null;
  /** When TrendRadar first collected the article. */
  discoveredAt: string;
}

export function articleDates(a: Article): ArticleDates {
  let sourceDate: ArticleDates['sourceDate'] = null;
  if (a.publishedAt !== undefined) sourceDate = { kind: 'published', iso: a.publishedAt };
  else if (a.updatedAt !== undefined) sourceDate = { kind: 'updated', iso: a.updatedAt };
  return { sourceDate, discoveredAt: a.firstSeenAt };
}

/** A UTC half-open window [start, end). */
export interface UtcWindow {
  start: Date;
  end: Date;
}

/**
 * "Published in window" only considers declared source dates. Articles with
 * unknown dates are excluded, not assumed recent.
 */
export function isPublishedWithin(a: Article, w: UtcWindow): boolean {
  if (a.publishedAt === undefined) return false;
  const t = Date.parse(a.publishedAt);
  return t >= w.start.getTime() && t < w.end.getTime();
}

export function isDiscoveredWithin(a: Article, w: UtcWindow): boolean {
  const t = Date.parse(a.firstSeenAt);
  return t >= w.start.getTime() && t < w.end.getTime();
}

/**
 * Start of the local calendar day containing `now`, in the given IANA time
 * zone, returned as a UTC instant. Handles DST transitions by resolving the
 * zone offset at the computed instant.
 */
export function startOfLocalDay(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const y = get('year');
  const m = get('month');
  const d = get('day');
  // Initial guess: local midnight interpreted as UTC, then correct by the offset.
  let guess = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 3; i++) {
    const offset = zoneOffsetMs(new Date(guess), timeZone);
    const candidate = Date.UTC(y, m - 1, d) - offset;
    if (candidate === guess) break;
    guess = candidate;
  }
  return new Date(guess);
}

function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Local "today" window [start of local day, start of next local day). */
export function localTodayWindow(now: Date, timeZone: string): UtcWindow {
  const start = startOfLocalDay(now, timeZone);
  // Next local midnight: jump 26h then snap, so 23h/25h DST days are handled.
  const end = startOfLocalDay(new Date(start.getTime() + 26 * 3_600_000), timeZone);
  return { start, end };
}

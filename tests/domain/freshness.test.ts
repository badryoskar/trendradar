import { describe, expect, it } from 'vitest';
import {
  articleDates,
  isDiscoveredWithin,
  isPublishedWithin,
  localTodayWindow,
  startOfLocalDay,
} from '../../src/domain/freshness';
import { makeArticle } from '../helpers';

describe('article dates', () => {
  it('never substitutes the collection time for a missing publication date', () => {
    const { publishedAt: _drop, ...rest } = makeArticle();
    const a = { ...rest, temporalQuality: 'unknown' as const };
    expect(articleDates(a).sourceDate).toBeNull();
    expect(articleDates(a).discoveredAt).toBe(a.firstSeenAt);
  });

  it('falls back to the source update date, labelled as such', () => {
    const { publishedAt: _drop, ...rest } = makeArticle();
    const a = { ...rest, updatedAt: '2026-11-09T00:00:00.000Z', temporalQuality: 'source-updated' as const };
    expect(articleDates(a).sourceDate).toEqual({ kind: 'updated', iso: '2026-11-09T00:00:00.000Z' });
  });

  it('an old article discovered today is "discovered today" but not "published today"', () => {
    const now = new Date('2026-11-12T15:00:00.000Z');
    const today = localTodayWindow(now, 'America/Toronto');
    const a = makeArticle({
      publishedAt: '2026-11-02T10:00:00.000Z',
      firstSeenAt: '2026-11-12T14:00:00.000Z',
      lastSeenAt: '2026-11-12T14:00:00.000Z',
      fetchedAt: '2026-11-12T14:00:00.000Z',
    });
    expect(isDiscoveredWithin(a, today)).toBe(true);
    expect(isPublishedWithin(a, today)).toBe(false);
  });

  it('undated articles are never in a publication window', () => {
    const { publishedAt: _drop, ...rest } = makeArticle();
    const a = { ...rest, temporalQuality: 'unknown' as const };
    expect(isPublishedWithin(a, { start: new Date(0), end: new Date('2100-01-01T00:00:00Z') })).toBe(false);
  });
});

describe('local day windows (time zones, midnight, DST)', () => {
  it('computes local midnight in Toronto during EST (UTC-5)', () => {
    expect(startOfLocalDay(new Date('2026-11-12T15:00:00Z'), 'America/Toronto').toISOString()).toBe(
      '2026-11-12T05:00:00.000Z',
    );
  });

  it('just after UTC midnight is still the previous local day in Toronto', () => {
    expect(startOfLocalDay(new Date('2026-11-13T02:00:00Z'), 'America/Toronto').toISOString()).toBe(
      '2026-11-12T05:00:00.000Z',
    );
  });

  it('handles the 25-hour day at the end of DST (2026-11-01 in Toronto)', () => {
    const w = localTodayWindow(new Date('2026-11-01T12:00:00Z'), 'America/Toronto');
    expect(w.start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect((w.end.getTime() - w.start.getTime()) / 3_600_000).toBe(25);
  });

  it('handles the 23-hour day at the start of DST (2026-03-08 in Toronto)', () => {
    const w = localTodayWindow(new Date('2026-03-08T12:00:00Z'), 'America/Toronto');
    expect(w.start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect((w.end.getTime() - w.start.getTime()) / 3_600_000).toBe(23);
  });

  it('UTC zone is identity', () => {
    expect(startOfLocalDay(new Date('2026-11-12T23:59:59Z'), 'UTC').toISOString()).toBe('2026-11-12T00:00:00.000Z');
  });
});

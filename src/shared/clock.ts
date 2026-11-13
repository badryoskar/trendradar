/**
 * Injectable clock. Domain and persistence code never call `Date.now()`
 * directly so tests can pin time deterministically.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(iso: string): Clock {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`fixedClock: invalid date ${iso}`);
  return { now: () => new Date(t) };
}

/** Serialises a Date as ISO-8601 UTC (always ends with `Z`). */
export function toIsoUtc(d: Date): string {
  if (Number.isNaN(d.getTime())) throw new Error('toIsoUtc: invalid date');
  return d.toISOString();
}

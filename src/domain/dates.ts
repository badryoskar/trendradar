/**
 * Strict parsing of feed dates into ISO UTC. Anything ambiguous or
 * implausible yields `undefined` (date unknown) plus a warning code, never a
 * guessed value.
 */
import { toIsoUtc } from '../shared/clock';

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** RFC 822 / 2822 zone names. Military single letters are ignored (unknown). */
const ZONES: Record<string, number> = {
  UT: 0,
  UTC: 0,
  GMT: 0,
  Z: 0,
  EST: -5,
  EDT: -4,
  CST: -6,
  CDT: -5,
  MST: -7,
  MDT: -6,
  PST: -8,
  PDT: -7,
};

export type DateParse = { iso: string; warning?: undefined } | { iso?: undefined; warning: string };

const RFC822 =
  /^(?:[A-Za-z]{3},?\s+)?(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{2}|\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{4}|[A-Za-z]{1,5})?\s*$/;
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

export function parseFeedDate(raw: string | null | undefined, now: Date): DateParse | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = raw.trim();
  if (s === '') return undefined;

  let ms: number | null = null;
  let m = RFC822.exec(s);
  if (m) {
    const [, d, mon, y, hh, mm, ss, zone] = m;
    const month = MONTHS[mon!.slice(0, 3).toLowerCase()];
    if (month === undefined) return { warning: 'date-unparseable' };
    let year = Number(y);
    if (y!.length === 2) year += year < 50 ? 2000 : 1900;
    let offsetMin: number;
    if (!zone) return { warning: 'date-no-timezone' };
    if (/^[+-]\d{4}$/.test(zone)) {
      const sign = zone.startsWith('-') ? -1 : 1;
      offsetMin = sign * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(3, 5)));
    } else {
      const h = ZONES[zone.toUpperCase()];
      if (h === undefined) return { warning: 'date-unknown-timezone' };
      offsetMin = h * 60;
    }
    ms = Date.UTC(year, month, Number(d), Number(hh), Number(mm), Number(ss ?? 0)) - offsetMin * 60_000;
    if (!validParts(year, month, Number(d), Number(hh), Number(mm), Number(ss ?? 0)))
      return { warning: 'date-unparseable' };
  } else if ((m = ISO.exec(s))) {
    const [, y, mo, d, hh, mm, ss, zone] = m;
    if (hh === undefined) return { warning: 'date-no-time' };
    if (!zone) return { warning: 'date-no-timezone' };
    let offsetMin = 0;
    if (zone.toUpperCase() !== 'Z') {
      const sign = zone.startsWith('-') ? -1 : 1;
      const digits = zone.slice(1).replace(':', '');
      offsetMin = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
    }
    if (!validParts(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? 0))) {
      return { warning: 'date-unparseable' };
    }
    ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? 0)) - offsetMin * 60_000;
  } else {
    return { warning: 'date-unparseable' };
  }

  if (ms > now.getTime() + 86_400_000) return { warning: 'date-in-future' };
  if (ms < Date.UTC(1995, 0, 1)) return { warning: 'date-implausible' };
  return { iso: toIsoUtc(new Date(ms)) };
}

function validParts(y: number, mo: number, d: number, h: number, mi: number, s: number): boolean {
  if (mo < 0 || mo > 11 || d < 1 || h > 23 || mi > 59 || s > 60) return false;
  const probe = new Date(Date.UTC(y, mo, d));
  return probe.getUTCMonth() === mo && probe.getUTCDate() === d;
}

/** Unix seconds (HN) to ISO UTC, with the same plausibility bounds. */
export function unixToIso(seconds: number, now: Date): DateParse {
  if (!Number.isFinite(seconds)) return { warning: 'date-unparseable' };
  const ms = seconds * 1000;
  if (ms > now.getTime() + 86_400_000) return { warning: 'date-in-future' };
  if (ms < Date.UTC(2006, 0, 1)) return { warning: 'date-implausible' };
  return { iso: toIsoUtc(new Date(ms)) };
}

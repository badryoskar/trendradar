/**
 * RSS 2.0 / RSS 1.0 (RDF) / Atom 1.0 parser.
 *
 * Runs in an extension page with DOMParser (unavailable in MV3 service
 * workers — see ARCHITECTURE notes). Security:
 *  - documents declaring entities or an internal DTD subset are rejected
 *    before parsing (no entity expansion, no XXE);
 *  - the XML is parsed as data (application/xml), never inserted in a page;
 *  - titles/excerpts go through htmlToText and are rendered as text only;
 *  - only the excerpt the feed itself provides is kept, truncated; full
 *    `content` / `content:encoded` bodies are deliberately ignored.
 */
import type { FeedFormat } from '../domain/content.types';
import { resolveLink } from '../domain/canonicalize-url';
import { parseFeedDate } from '../domain/dates';
import { MAX_EXCERPT_LENGTH, MAX_TITLE_LENGTH, collapse, htmlToText, truncate } from '../domain/text';
import { ConnectorError } from '../shared/failures';

export interface ParsedFeed {
  format: FeedFormat;
  title: string | undefined;
  siteUrl: string | undefined;
  language: string | undefined;
  items: ParsedItem[];
  warnings: string[];
}

export interface ParsedItem {
  externalId: string | undefined;
  title: string;
  url: string;
  publishedAt: string | undefined;
  updatedAt: string | undefined;
  excerpt: string | undefined;
  byline: string | undefined;
}

export function parseFeed(xml: string, baseUrl: string, now: Date, maxItems: number): ParsedFeed {
  // Reject DTDs with an internal subset and any entity declaration.
  if (/<!ENTITY/i.test(xml) || /<!DOCTYPE[^>]*\[/i.test(xml)) {
    throw new ConnectorError('parse', 'Flux refusé : déclarations d’entités XML non autorisées.');
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0 || !doc.documentElement) {
    throw new ConnectorError('parse', 'XML invalide.');
  }
  const root = doc.documentElement;
  const warnings: string[] = [];

  switch (root.localName) {
    case 'rss': {
      const channel = child(root, 'channel');
      if (!channel) throw new ConnectorError('parse', 'Flux RSS sans <channel>.');
      return rssLike('rss2', channel, children(channel, 'item'), baseUrl, now, maxItems, warnings);
    }
    case 'RDF': {
      const channel = child(root, 'channel');
      return rssLike('rss1', channel ?? root, children(root, 'item'), baseUrl, now, maxItems, warnings);
    }
    case 'feed':
      return atom(root, baseUrl, now, maxItems, warnings);
    default:
      throw new ConnectorError('parse', `Format non reconnu (<${root.localName}>).`);
  }
}

// ---------------------------------------------------------------- helpers
function children(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === name);
}
function child(el: Element, name: string): Element | undefined {
  return children(el, name)[0];
}
function text(el: Element | undefined): string | undefined {
  if (!el) return undefined;
  const t = collapse(el.textContent ?? '');
  return t === '' ? undefined : t;
}
function firstText(el: Element, names: string[]): string | undefined {
  for (const n of names) {
    const t = text(child(el, n));
    if (t !== undefined) return t;
  }
  return undefined;
}

function cleanTitle(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const t = truncate(htmlToText(raw), MAX_TITLE_LENGTH);
  return t === '' ? undefined : t;
}
function cleanExcerpt(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const t = truncate(htmlToText(raw), MAX_EXCERPT_LENGTH);
  return t === '' ? undefined : t;
}

function date(raw: string | undefined, now: Date, warnings: string[]): string | undefined {
  const r = parseFeedDate(raw, now);
  if (r === undefined) return undefined;
  if (r.warning) {
    warnings.push(r.warning);
    return undefined;
  }
  return r.iso;
}

function finalize(items: ParsedItem[], maxItems: number, warnings: string[]): ParsedItem[] {
  if (items.length > maxItems) warnings.push(`items-truncated:${items.length}->${maxItems}`);
  return items.slice(0, maxItems);
}

// -------------------------------------------------------------------- RSS
function rssLike(
  format: 'rss2' | 'rss1',
  channel: Element,
  itemEls: Element[],
  baseUrl: string,
  now: Date,
  maxItems: number,
  warnings: string[],
): ParsedFeed {
  const siteUrl = resolveLink(text(child(channel, 'link')), baseUrl) ?? undefined;
  const items: ParsedItem[] = [];
  for (const item of itemEls.slice(0, maxItems * 2)) {
    const title = cleanTitle(text(child(item, 'title')));
    const guidEl = child(item, 'guid');
    const guid = text(guidEl);
    const guidIsLink = guidEl !== undefined && guidEl.getAttribute('isPermaLink') !== 'false';
    const url =
      resolveLink(text(child(item, 'link')), baseUrl) ??
      (guidIsLink ? resolveLink(guid, baseUrl) : null) ??
      resolveLink(
        item.getAttribute('rdf:about') ?? item.getAttributeNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'about'),
        baseUrl,
      );
    if (!title) {
      warnings.push('item-skipped:no-title');
      continue;
    }
    if (!url) {
      warnings.push('item-skipped:no-link');
      continue;
    }
    items.push({
      externalId: guid ?? url,
      title,
      url,
      publishedAt: date(firstText(item, ['pubDate', 'date', 'issued']), now, warnings),
      updatedAt: date(firstText(item, ['updated', 'modified']), now, warnings),
      excerpt: cleanExcerpt(firstText(item, ['description', 'summary', 'abstract'])),
      byline: firstText(item, ['creator', 'author']),
    });
  }
  return {
    format,
    title: cleanTitle(text(child(channel, 'title'))),
    siteUrl,
    language: firstText(channel, ['language']),
    items: finalize(items, maxItems, warnings),
    warnings,
  };
}

// ------------------------------------------------------------------- Atom
function atomText(el: Element | undefined): string | undefined {
  if (!el) return undefined;
  // type="xhtml" embeds markup as child elements; textContent flattens it.
  return text(el);
}

function atomLink(entry: Element, baseUrl: string): string | null {
  const links = children(entry, 'link');
  const pick =
    links.find(
      (l) => (l.getAttribute('rel') ?? 'alternate') === 'alternate' && /html|^$/.test(l.getAttribute('type') ?? ''),
    ) ?? links.find((l) => (l.getAttribute('rel') ?? 'alternate') === 'alternate');
  const base = entry.getAttribute('xml:base') ?? baseUrl;
  return resolveLink(pick?.getAttribute('href'), resolveLink(base, baseUrl) ?? baseUrl);
}

function atom(root: Element, baseUrl: string, now: Date, maxItems: number, warnings: string[]): ParsedFeed {
  const feedBase = resolveLink(root.getAttribute('xml:base'), baseUrl) ?? baseUrl;
  const items: ParsedItem[] = [];
  for (const entry of children(root, 'entry').slice(0, maxItems * 2)) {
    const title = cleanTitle(atomText(child(entry, 'title')));
    const url = atomLink(entry, feedBase);
    if (!title) {
      warnings.push('item-skipped:no-title');
      continue;
    }
    if (!url) {
      warnings.push('item-skipped:no-link');
      continue;
    }
    const author = child(entry, 'author');
    items.push({
      externalId: text(child(entry, 'id')) ?? url,
      title,
      url,
      publishedAt: date(text(child(entry, 'published')), now, warnings),
      updatedAt: date(text(child(entry, 'updated')), now, warnings),
      excerpt: cleanExcerpt(atomText(child(entry, 'summary'))),
      byline: author ? text(child(author, 'name')) : undefined,
    });
  }
  const siteLink = children(root, 'link').find((l) => (l.getAttribute('rel') ?? 'alternate') === 'alternate');
  return {
    format: 'atom',
    title: cleanTitle(atomText(child(root, 'title'))),
    siteUrl: resolveLink(siteLink?.getAttribute('href'), feedBase) ?? undefined,
    language: root.getAttribute('xml:lang') ?? undefined,
    items: finalize(items, maxItems, warnings),
    warnings,
  };
}

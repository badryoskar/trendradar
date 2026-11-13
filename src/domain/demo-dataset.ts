/**
 * SYNTHETIC DEMONSTRATION DATA — NOT REAL NEWS.
 *
 * Used only when the user explicitly clicks "Charger la démo". Every record
 * belongs to a source flagged `isDemo: true`, points to the reserved
 * `example.com` domain (RFC 2606) and is badged "Démo" in the interface.
 * Dates are expressed relative to the injected clock so the demo looks
 * recent, yet stays deterministic for a given clock.
 */
import type { Article, Source } from './content.types';
import { toIsoUtc, type Clock } from '../shared/clock';

export const DEMO_SOURCE_ID = 'demo-synthetic';

interface DemoItem {
  slug: string;
  title: string;
  /** Hours before "now" the item was published; null = no source date. */
  publishedHoursAgo: number | null;
  /** Hours before "now" the item was first collected. */
  firstSeenHoursAgo: number;
  categories: string[];
  excerpt?: string;
}

const ITEMS: DemoItem[] = [
  {
    slug: 'php-84-release',
    title: '[Démo] Exemple : publication d’une version mineure de PHP',
    publishedHoursAgo: 3,
    firstSeenHoursAgo: 1,
    categories: ['wordpress-php', 'web-development'],
    excerpt: 'Extrait fictif fourni par le flux de démonstration.',
  },
  {
    slug: 'browser-css-feature',
    title: '[Démo] Exemple : un navigateur active une nouvelle propriété CSS',
    publishedHoursAgo: 20,
    firstSeenHoursAgo: 2,
    categories: ['web-development'],
  },
  {
    slug: 'undated-item',
    title: '[Démo] Exemple : article sans date de publication déclarée',
    publishedHoursAgo: null,
    firstSeenHoursAgo: 1,
    categories: ['technology'],
    excerpt: 'Ce flux ne fournit pas de date : TrendRadar affiche « date de publication indisponible ».',
  },
  {
    slug: 'old-item-new-discovery',
    title: '[Démo] Exemple : article publié il y a 10 jours, découvert aujourd’hui',
    publishedHoursAgo: 240,
    firstSeenHoursAgo: 1,
    categories: ['cybersecurity'],
  },
  {
    slug: 'jobs-market',
    title: '[Démo] Exemple : rapport sur le marché de l’emploi des développeurs',
    publishedHoursAgo: 50,
    firstSeenHoursAgo: 30,
    categories: ['jobs'],
  },
];

export function demoSource(clock: Clock): Source {
  return {
    id: DEMO_SOURCE_ID,
    kind: 'feed',
    name: 'Démonstration (données fictives)',
    origin: 'https://example.com',
    enabled: false,
    health: 'never-fetched',
    attributionUrl: 'https://example.com/',
    categoryIds: [],
    createdAt: toIsoUtc(clock.now()),
    consecutiveFailures: 0,
    isDemo: true,
  };
}

export function demoArticles(clock: Clock): Article[] {
  const now = clock.now().getTime();
  const at = (hoursAgo: number) => toIsoUtc(new Date(now - hoursAgo * 3_600_000));
  return ITEMS.map((item) => {
    const url = `https://example.com/demo/${item.slug}`;
    const seen = at(item.firstSeenHoursAgo);
    const base: Article = {
      id: `demo:${item.slug}`,
      title: item.title,
      canonicalUrl: url,
      provenance: [
        { sourceId: DEMO_SOURCE_ID, externalId: item.slug, originalUrl: url, firstSeenAt: seen, lastSeenAt: seen },
      ],
      sourceIds: [DEMO_SOURCE_ID],
      temporalQuality: item.publishedHoursAgo === null ? 'unknown' : 'source-published',
      firstSeenAt: seen,
      lastSeenAt: seen,
      fetchedAt: seen,
      autoCategories: item.categories,
    };
    if (item.publishedHoursAgo !== null) base.publishedAt = at(item.publishedHoursAgo);
    if (item.excerpt !== undefined) {
      base.excerpt = item.excerpt;
      base.excerptOrigin = 'feed';
    }
    return base;
  });
}

import type { Category } from './content.types';

/**
 * Starter categories (version 1). Keywords are explicit and editable by the
 * user; matching rules live in `classify.ts` (phase 3). Generic keywords are
 * deliberately conservative to limit false positives.
 */
export const DEFAULT_CATEGORIES_VERSION = '1';

type Seed = Omit<Category, 'isCustom' | 'hidden' | 'order' | 'excludeKeywords'> & { excludeKeywords?: string[] };

const seeds: Seed[] = [
  {
    id: 'technology',
    label: 'Technology',
    keywords: ['technology', 'tech', 'technologie', 'hardware', 'software', 'logiciel'],
  },
  {
    id: 'web-development',
    label: 'Web Development',
    keywords: [
      'javascript',
      'typescript',
      'css',
      'html',
      'react',
      'frontend',
      'backend',
      'web dev',
      'node.js',
      'browser',
    ],
  },
  {
    id: 'wordpress-php',
    label: 'WordPress/PHP',
    keywords: ['wordpress', 'php', 'woocommerce', 'gutenberg', 'laravel', 'symfony'],
  },
  {
    id: 'ai',
    label: 'AI',
    keywords: [
      'artificial intelligence',
      'intelligence artificielle',
      'machine learning',
      'llm',
      'neural network',
      'deep learning',
    ],
  },
  {
    id: 'cybersecurity',
    label: 'Cybersecurity',
    keywords: [
      'security',
      'sécurité',
      'vulnerability',
      'vulnérabilité',
      'cve',
      'ransomware',
      'malware',
      'phishing',
      'exploit',
    ],
  },
  {
    id: 'startups',
    label: 'Startups',
    keywords: ['startup', 'start-up', 'seed round', 'series a', 'venture capital', 'yc', 'founder'],
  },
  {
    id: 'business-economy',
    label: 'Business/Economy',
    keywords: ['economy', 'économie', 'inflation', 'market', 'marché', 'earnings', 'gdp', 'pib'],
  },
  {
    id: 'marketing-seo',
    label: 'Marketing/SEO',
    keywords: ['seo', 'marketing', 'search ranking', 'référencement', 'advertising', 'publicité'],
  },
  { id: 'design', label: 'Design', keywords: ['design', 'ux', 'ui design', 'typography', 'typographie', 'figma'] },
  {
    id: 'jobs',
    label: 'Jobs',
    keywords: ['hiring', 'job', 'jobs', 'emploi', 'recrutement', 'layoffs', 'licenciements', 'remote work'],
  },
  { id: 'general', label: 'General', keywords: [] },
];

export const UNCLASSIFIED_CATEGORY_ID = 'unclassified';

export function defaultCategories(): Category[] {
  const list: Category[] = seeds.map((s, i) => ({
    id: s.id,
    label: s.label,
    keywords: s.keywords,
    excludeKeywords: s.excludeKeywords ?? [],
    isCustom: false,
    hidden: false,
    order: i,
  }));
  list.push({
    id: UNCLASSIFIED_CATEGORY_ID,
    label: 'Unclassified',
    keywords: [],
    excludeKeywords: [],
    isCustom: false,
    hidden: false,
    order: list.length,
  });
  return list;
}

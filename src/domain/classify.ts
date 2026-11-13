/**
 * Deterministic, explainable keyword classification (rule version 1).
 *
 * - Text = article title + feed excerpt, normalised (NFKD, accents removed,
 *   lower-case, punctuation -> spaces).
 * - A keyword matches on whole-word boundaries; multi-word keywords match as
 *   a phrase. `node.js` style keywords are normalised the same way.
 * - An exclusion keyword in the text cancels its category.
 * - Effective categories = user override if set, otherwise
 *   (keyword matches ∪ categories inherited from the source); hidden
 *   categories are kept but not displayed; nothing matched -> "unclassified".
 * Classification is computed at read time from the current category list,
 * so editing keywords re-classifies immediately without a migration.
 */
import type { Article, ArticleUserState, Category } from './content.types';
import { UNCLASSIFIED_CATEGORY_ID } from './default-categories';

export const CLASSIFIER_VERSION = '1';

export function normalizeForMatch(s: string): string {
  return ` ${s
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;
}

export interface Classification {
  categoryIds: string[];
  /** categoryId -> keywords that matched (for the "why" explanation). */
  matches: Record<string, string[]>;
  /** categoryId -> exclusion keywords that cancelled a match. */
  excludedBy: Record<string, string[]>;
  origin: 'override' | 'rules';
}

type Compiled = Array<{ id: string; keywords: Array<[string, string]>; exclude: Array<[string, string]> }>;
/** Normalised keywords per category list (lists are replaced, never mutated, on edit). */
const compiledCache = new WeakMap<Category[], Compiled>();

function compile(categories: Category[]): Compiled {
  let c = compiledCache.get(categories);
  if (!c) {
    const norm = (ks: string[]) =>
      ks.map((k) => [k, normalizeForMatch(k)] as [string, string]).filter(([, n]) => n.trim() !== '');
    c = categories.map((cat) => ({ id: cat.id, keywords: norm(cat.keywords), exclude: norm(cat.excludeKeywords) }));
    compiledCache.set(categories, c);
  }
  return c;
}

export function classifyText(text: string, categories: Category[]): Pick<Classification, 'matches' | 'excludedBy'> {
  const hay = normalizeForMatch(text);
  const matches: Record<string, string[]> = {};
  const excludedBy: Record<string, string[]> = {};
  for (const c of compile(categories)) {
    const hits = c.keywords.filter(([, n]) => hay.includes(n)).map(([k]) => k);
    if (hits.length === 0) continue;
    const excl = c.exclude.filter(([, n]) => hay.includes(n)).map(([k]) => k);
    if (excl.length > 0) excludedBy[c.id] = excl;
    else matches[c.id] = hits;
  }
  return { matches, excludedBy };
}

export function classifyArticle(
  article: Pick<Article, 'title' | 'excerpt' | 'autoCategories'>,
  categories: Category[],
  state?: Pick<ArticleUserState, 'categoryOverride'>,
): Classification {
  const known = new Set(categories.map((c) => c.id));
  const order = new Map(categories.map((c) => [c.id, c.order]));
  const sort = (ids: string[]) =>
    [...new Set(ids)]
      .filter((id) => known.has(id))
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0) || a.localeCompare(b));

  if (state?.categoryOverride !== undefined) {
    const ids = sort(state.categoryOverride);
    return {
      categoryIds: ids.length ? ids : [UNCLASSIFIED_CATEGORY_ID],
      matches: {},
      excludedBy: {},
      origin: 'override',
    };
  }
  const { matches, excludedBy } = classifyText(`${article.title} ${article.excerpt ?? ''}`, categories);
  const fromSource = article.autoCategories.filter((id) => !(id in excludedBy));
  const ids = sort([...Object.keys(matches), ...fromSource]).filter((id) => id !== UNCLASSIFIED_CATEGORY_ID);
  return { categoryIds: ids.length ? ids : [UNCLASSIFIED_CATEGORY_ID], matches, excludedBy, origin: 'rules' };
}

/** Parses a comma/semicolon/newline separated keyword list. */
export function parseKeywordList(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[,;\n]/)
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && k.length <= 80),
    ),
  ].slice(0, 200);
}

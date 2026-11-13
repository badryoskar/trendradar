import { describe, expect, it } from 'vitest';
import { classifyArticle, classifyText, normalizeForMatch, parseKeywordList } from '../../src/domain/classify';
import type { Category } from '../../src/domain/content.types';
import { defaultCategories } from '../../src/domain/default-categories';

const cats = defaultCategories();
const article = (title: string, extra: { excerpt?: string; autoCategories?: string[] } = {}) => ({
  title,
  autoCategories: extra.autoCategories ?? [],
  ...(extra.excerpt !== undefined ? { excerpt: extra.excerpt } : {}),
});

describe('keyword classification', () => {
  it('matches whole words, accent- and case-insensitively', () => {
    expect(classifyArticle(article('Nouvelle VULNÉRABILITÉ critique'), cats).categoryIds).toEqual(['cybersecurity']);
    expect(classifyArticle(article('Sortie de PHP 8.5'), cats).categoryIds).toEqual(['wordpress-php']);
    // "react" must not match inside "reaction"
    expect(classifyArticle(article('Chemical reaction study'), cats).categoryIds).toEqual(['unclassified']);
  });

  it('matches multi-word phrases and punctuated keywords', () => {
    expect(classifyArticle(article('Advances in machine learning'), cats).categoryIds).toEqual(['ai']);
    expect(classifyArticle(article('Node.js 24 released'), cats).categoryIds).toEqual(['web-development']);
    expect(classifyArticle(article('machine and learning'), cats).categoryIds).toEqual(['unclassified']);
  });

  it('supports multiple categories, ordered by category order, and explains matches', () => {
    const c = classifyArticle(article('WordPress security: a new CVE in a PHP plugin'), cats);
    expect(c.categoryIds).toEqual(['wordpress-php', 'cybersecurity']);
    expect(c.matches['wordpress-php']).toEqual(['wordpress', 'php']);
    expect(c.matches.cybersecurity).toEqual(['security', 'cve']);
    expect(c.origin).toBe('rules');
  });

  it('uses the excerpt too', () => {
    expect(
      classifyArticle(article('Annonce', { excerpt: 'Une levée de fonds en seed round' }), cats).categoryIds,
    ).toEqual(['startups']);
  });

  it('applies exclusions', () => {
    const custom: Category[] = cats.map((c) => (c.id === 'jobs' ? { ...c, excludeKeywords: ['steve jobs'] } : c));
    const r = classifyArticle(article('Steve Jobs biography: the job of a lifetime'), custom);
    expect(r.categoryIds).toEqual(['unclassified']);
    expect(r.excludedBy.jobs).toEqual(['steve jobs']);
  });

  it('adds categories inherited from the source, but never unknown ids', () => {
    expect(
      classifyArticle(article('Rien de spécial', { autoCategories: ['technology', 'deleted-cat'] }), cats).categoryIds,
    ).toEqual(['technology']);
  });

  it('a manual override replaces the rules entirely', () => {
    const c = classifyArticle(article('PHP security'), cats, { categoryOverride: ['design'] });
    expect(c).toMatchObject({ categoryIds: ['design'], origin: 'override', matches: {} });
    expect(classifyArticle(article('PHP'), cats, { categoryOverride: [] }).categoryIds).toEqual(['unclassified']);
  });

  it('is deterministic', () => {
    const t = 'AI startup raises series A to fight phishing with LLM';
    expect(classifyText(t, cats)).toEqual(classifyText(t, cats));
    expect(classifyArticle(article(t), cats).categoryIds).toEqual(['ai', 'cybersecurity', 'startups']);
  });

  it('normalises text and parses keyword lists', () => {
    expect(normalizeForMatch('  Été — C’est « super » !')).toBe(' ete c est super ');
    expect(parseKeywordList('rust, go ;\nzig, rust, ,')).toEqual(['rust', 'go', 'zig']);
  });
});

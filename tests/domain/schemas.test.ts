import { describe, expect, it } from 'vitest';
import { articleSchema, sourceSchema } from '../../src/domain/content.types';
import { makeArticle, makeSource } from '../helpers';

describe('articleSchema invariants', () => {
  it('accepts a well-formed article', () => {
    expect(articleSchema.safeParse(makeArticle()).success).toBe(true);
  });

  it('rejects non-UTC timestamps', () => {
    expect(articleSchema.safeParse(makeArticle({ publishedAt: '2026-11-10T08:00:00+02:00' })).success).toBe(false);
    expect(articleSchema.safeParse(makeArticle({ publishedAt: '2026-11-10' })).success).toBe(false);
  });

  it('rejects javascript: and data: URLs', () => {
    expect(articleSchema.safeParse(makeArticle({ canonicalUrl: 'javascript:alert(1)' })).success).toBe(false);
    expect(articleSchema.safeParse(makeArticle({ canonicalUrl: 'data:text/html,<b>x</b>' })).success).toBe(false);
  });

  it('forbids a publishedAt when temporal quality is unknown', () => {
    const r = articleSchema.safeParse(makeArticle({ temporalQuality: 'unknown' }));
    expect(r.success).toBe(false);
  });

  it('requires a source date when temporal quality is known', () => {
    const { publishedAt: _drop, ...noDate } = makeArticle();
    expect(articleSchema.safeParse({ ...noDate, temporalQuality: 'source-published' }).success).toBe(false);
    expect(articleSchema.safeParse({ ...noDate, temporalQuality: 'unknown' }).success).toBe(true);
  });

  it('requires sourceIds to match provenance', () => {
    expect(articleSchema.safeParse(makeArticle({ sourceIds: ['src-b'] })).success).toBe(false);
  });

  it('requires an excerpt origin when an excerpt is stored', () => {
    expect(articleSchema.safeParse(makeArticle({ excerpt: 'texte' })).success).toBe(false);
    expect(articleSchema.safeParse(makeArticle({ excerpt: 'texte', excerptOrigin: 'feed' })).success).toBe(true);
  });

  it('rejects firstSeenAt after lastSeenAt', () => {
    expect(
      articleSchema.safeParse(
        makeArticle({ firstSeenAt: '2026-11-11T00:00:00.000Z', lastSeenAt: '2026-11-10T00:00:00.000Z' }),
      ).success,
    ).toBe(false);
  });
});

describe('sourceSchema', () => {
  it('requires https feed URLs', () => {
    expect(sourceSchema.safeParse(makeSource()).success).toBe(true);
    expect(sourceSchema.safeParse(makeSource({ feedUrl: 'http://a.example.org/feed.xml' })).success).toBe(false);
  });
});

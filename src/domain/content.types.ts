/**
 * Core domain model. Every type that crosses a trust boundary (storage reads,
 * network payloads, imported fixtures) has a zod schema and is validated at
 * runtime; the TypeScript types are inferred from the schemas so the two can
 * never drift apart.
 *
 * Date invariant: every timestamp is an ISO-8601 UTC string ending in `Z`.
 * Local time is only produced in the UI layer.
 */
import { z } from 'zod';

export const isoUtc = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/, 'expected ISO-8601 UTC timestamp')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'invalid date');
export type IsoUtc = z.infer<typeof isoUtc>;

const id = z.string().min(1).max(200);

const httpsUrl = z
  .string()
  .max(4096)
  .refine((s) => {
    try {
      return new URL(s).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'expected https: URL');

/** Links shown to the user may be http or https; never javascript:, data:, etc. */
const webUrl = z
  .string()
  .max(4096)
  .refine((s) => {
    try {
      const p = new URL(s).protocol;
      return p === 'https:' || p === 'http:';
    } catch {
      return false;
    }
  }, 'expected http(s) URL');

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export const sourceKind = z.enum(['hacker-news', 'feed']);
export type SourceKind = z.infer<typeof sourceKind>;

export const feedFormat = z.enum(['rss2', 'rss1', 'atom']);
export type FeedFormat = z.infer<typeof feedFormat>;

/** Health is independent from `enabled`: a disabled source keeps its last health. */
export const sourceHealth = z.enum(['never-fetched', 'ok', 'error', 'permission-needed', 'backoff', 'interrupted']);
export type SourceHealth = z.infer<typeof sourceHealth>;

export const fetchErrorCode = z.enum([
  'http',
  'permission',
  'timeout',
  'parse',
  'rate-limit',
  'network',
  'too-large',
  'invalid-content-type',
  'redirect-blocked',
  'aborted',
  'other',
]);
export type FetchErrorCode = z.infer<typeof fetchErrorCode>;

export const sourceSchema = z.object({
  id,
  kind: sourceKind,
  name: z.string().min(1).max(200),
  /** Origin the extension needs permission for, e.g. `https://example.com`. */
  origin: httpsUrl,
  feedUrl: httpsUrl.optional(),
  detectedFormat: feedFormat.optional(),
  enabled: z.boolean(),
  health: sourceHealth,
  attributionUrl: webUrl,
  categoryIds: z.array(id),
  createdAt: isoUtc,
  termsCheckedAt: isoUtc.optional(),
  lastAttemptAt: isoUtc.optional(),
  lastSuccessAt: isoUtc.optional(),
  lastErrorAt: isoUtc.optional(),
  lastErrorCode: fetchErrorCode.optional(),
  lastErrorMessage: z.string().max(500).optional(),
  consecutiveFailures: z.number().int().min(0),
  backoffUntil: isoUtc.optional(),
  /** Synthetic demonstration source: never fetched, always labelled in the UI. */
  isDemo: z.boolean().optional(),
});
export type Source = z.infer<typeof sourceSchema>;

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export const temporalQuality = z.enum(['source-published', 'source-updated', 'unknown']);
export type TemporalQuality = z.infer<typeof temporalQuality>;

export const sourceMetricSchema = z.object({
  metric: z.string().min(1).max(50),
  value: z.number().finite(),
  capturedAt: isoUtc,
});
export type SourceMetric = z.infer<typeof sourceMetricSchema>;

/** One sighting of an article in one source. Provenance is never overwritten. */
export const provenanceSchema = z.object({
  sourceId: id,
  externalId: z.string().max(500).optional(),
  originalUrl: webUrl,
  firstSeenAt: isoUtc,
  lastSeenAt: isoUtc,
  metrics: z.array(sourceMetricSchema).optional(),
});
export type Provenance = z.infer<typeof provenanceSchema>;

export const articleSchema = z
  .object({
    id,
    title: z.string().min(1).max(1000),
    canonicalUrl: webUrl,
    provenance: z.array(provenanceSchema).min(1),
    /** Derived from `provenance`; kept as a multiEntry index key. */
    sourceIds: z.array(id).min(1),
    publishedAt: isoUtc.optional(),
    updatedAt: isoUtc.optional(),
    temporalQuality,
    firstSeenAt: isoUtc,
    lastSeenAt: isoUtc,
    /** Last time a collection returned this article. */
    fetchedAt: isoUtc,
    autoCategories: z.array(id),
    excerpt: z.string().max(2000).optional(),
    excerptOrigin: z.enum(['feed', 'api']).optional(),
    byline: z.string().max(300).optional(),
    language: z.string().max(35).optional(),
  })
  .superRefine((a, ctx) => {
    const derived = [...new Set(a.provenance.map((p) => p.sourceId))].sort();
    const declared = [...a.sourceIds].sort();
    if (derived.join('\u0000') !== declared.join('\u0000')) {
      ctx.addIssue({ code: 'custom', message: 'sourceIds must match provenance', path: ['sourceIds'] });
    }
    if (a.temporalQuality === 'unknown' && a.publishedAt !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'unknown temporal quality cannot carry publishedAt',
        path: ['publishedAt'],
      });
    }
    if (a.temporalQuality !== 'unknown' && a.publishedAt === undefined && a.updatedAt === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'known temporal quality requires a source date',
        path: ['temporalQuality'],
      });
    }
    if (a.excerpt !== undefined && a.excerptOrigin === undefined) {
      ctx.addIssue({ code: 'custom', message: 'excerpt requires excerptOrigin', path: ['excerptOrigin'] });
    }
    if (a.firstSeenAt > a.lastSeenAt) {
      ctx.addIssue({ code: 'custom', message: 'firstSeenAt must be <= lastSeenAt', path: ['firstSeenAt'] });
    }
  });
export type Article = z.infer<typeof articleSchema>;

export const articleUserStateSchema = z.object({
  articleId: id,
  isSaved: z.boolean(),
  isRead: z.boolean(),
  readAt: isoUtc.optional(),
  savedAt: isoUtc.optional(),
  /** When set, replaces `Article.autoCategories` for display and filtering. */
  categoryOverride: z.array(id).optional(),
});
export type ArticleUserState = z.infer<typeof articleUserStateSchema>;

// ---------------------------------------------------------------------------
// Collection log, categories, clusters, signals
// ---------------------------------------------------------------------------

export const fetchAttemptSchema = z.object({
  id: z.number().int().positive().optional(),
  sourceId: id,
  startedAt: isoUtc,
  endedAt: isoUtc.optional(),
  success: z.boolean(),
  fetchedCount: z.number().int().min(0),
  insertedCount: z.number().int().min(0),
  /** Oldest known source date among returned items: drives window coverage. */
  oldestItemPublishedAt: isoUtc.optional(),
  errorCode: fetchErrorCode.optional(),
  statusCode: z.number().int().min(100).max(599).optional(),
  retryAfter: isoUtc.optional(),
});
export type FetchAttempt = z.infer<typeof fetchAttemptSchema>;

export const categorySchema = z.object({
  id,
  label: z.string().min(1).max(80),
  keywords: z.array(z.string().min(1).max(80)).max(200),
  excludeKeywords: z.array(z.string().min(1).max(80)).max(200),
  isCustom: z.boolean(),
  hidden: z.boolean(),
  order: z.number().int(),
});
export type Category = z.infer<typeof categorySchema>;

export const topicClusterSchema = z.object({
  id,
  label: z.string().min(1).max(1000),
  /** The article whose real title is used as the label (no generated text). */
  medoidArticleId: id,
  articleIds: z.array(id).min(1),
  firstObservedAt: isoUtc,
  lastObservedAt: isoUtc,
  distinctSourceIds: z.array(id).min(1),
  distinctOrigins: z.array(z.string()).min(1),
  sharedTerms: z.array(z.string()),
  clusteringRuleVersion: z.string().min(1),
});
export type TopicCluster = z.infer<typeof topicClusterSchema>;

const windowSchema = z.object({ start: isoUtc, end: isoUtc, count: z.number().int().min(0), covered: z.boolean() });

export const trendSignalSchema = z.object({
  clusterId: id,
  measuredAt: isoUtc,
  ruleVersion: z.string().min(1),
  status: z.enum(['emerging', 'recurring', 'insufficient-data']),
  recentWindow: windowSchema,
  baselineWindow: windowSchema,
  distinctSources: z.number().int().min(0),
  distinctOrigins: z.number().int().min(0),
  undatedArticles: z.number().int().min(0),
  reasonCodes: z.array(z.string()),
  /** Only present when the rule documents a formula and the evidence exists. */
  score: z.number().finite().optional(),
});
export type TrendSignal = z.infer<typeof trendSignalSchema>;

export const settingsSchema = z.object({
  retentionDays: z.number().int().min(1).max(3650),
  keepSavedOnPurge: z.boolean(),
  onboardingCompleted: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  retentionDays: 30,
  keepSavedOnPurge: true,
  onboardingCompleted: false,
};

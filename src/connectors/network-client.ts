/**
 * Bounded HTTP client for collectors. Runs in an extension page (not a
 * content script), so cross-origin access is governed by host permissions.
 *
 * Guarantees: https only, no cookies/credentials, no referrer, timeout,
 * response size cap enforced while streaming, content-type check, and the
 * final URL after redirects must stay on an origin the user authorised.
 * Limitation (documented): `fetch` follows redirects itself, so the request
 * to a redirect target is already sent when we inspect `response.url`.
 */
import { ConnectorError } from '../shared/failures';
import type { HostPermissions } from '../shared/permissions';
import { originPattern } from '../shared/safe-url';
import type { Clock } from '../shared/clock';
import { toIsoUtc } from '../shared/clock';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface NetworkDeps {
  fetchImpl: FetchLike;
  permissions: HostPermissions;
  clock: Clock;
}

export type ExpectedKind = 'xml' | 'json';

export interface FetchOptions {
  signal?: AbortSignal | undefined;
  timeoutMs?: number;
  maxBytes?: number;
  expect: ExpectedKind;
  /** Origins that need no host permission (server sends permissive CORS). */
  corsOrigins?: string[];
}

export interface FetchedResource {
  text: string;
  finalUrl: string;
  status: number;
  contentType: string;
}

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

const XML_TYPES = /^(application\/(rss\+xml|atom\+xml|rdf\+xml|xml)|text\/xml|text\/plain|application\/octet-stream)$/;
const JSON_TYPES = /^application\/json$/;

export async function fetchResource(url: string, opts: FetchOptions, deps: NetworkDeps): Promise<FetchedResource> {
  let requested: URL;
  try {
    requested = new URL(url);
  } catch {
    throw new ConnectorError('other', 'URL invalide.');
  }
  if (requested.protocol !== 'https:') throw new ConnectorError('other', 'Seules les URL https: sont autorisées.');

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  try {
    response = await deps.fetchImpl(requested.href, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      headers: {
        Accept:
          opts.expect === 'json'
            ? 'application/json'
            : 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8',
      },
      signal,
    });
  } catch (err) {
    throw await classifyThrown(err, requested, timeoutSignal, opts, deps);
  }

  // Redirect target must be https and authorised.
  const finalUrl = response.url ? new URL(response.url) : requested;
  if (finalUrl.protocol !== 'https:') {
    throw new ConnectorError('redirect-blocked', 'Redirection vers une URL non https refusée.');
  }
  if (finalUrl.origin !== requested.origin && !(await isAllowed(finalUrl, opts, deps))) {
    throw new ConnectorError('redirect-blocked', `Redirection vers ${finalUrl.host} non autorisée.`);
  }

  if (response.status === 429 || response.status === 503) {
    const retryAfter = parseRetryAfter(response.headers.get('retry-after'), deps.clock);
    throw new ConnectorError(
      response.status === 429 ? 'rate-limit' : 'http',
      `HTTP ${response.status}`,
      retryAfter ? { statusCode: response.status, retryAfter } : { statusCode: response.status },
    );
  }
  if (!response.ok) {
    throw new ConnectorError('http', `HTTP ${response.status}`, { statusCode: response.status });
  }

  const rawType = response.headers.get('content-type') ?? '';
  const mime = rawType.split(';')[0]?.trim().toLowerCase() ?? '';
  const typeOk = opts.expect === 'json' ? JSON_TYPES.test(mime) : mime === '' || XML_TYPES.test(mime);
  if (!typeOk) {
    throw new ConnectorError('invalid-content-type', `Type de contenu inattendu (${mime || 'absent'}).`, {
      statusCode: response.status,
    });
  }

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ConnectorError('too-large', `Réponse trop volumineuse (${declaredLength} octets).`);
  }

  let bytes: Uint8Array;
  try {
    bytes = await readCapped(response, maxBytes);
  } catch (err) {
    if (err instanceof ConnectorError) throw err;
    throw await classifyThrown(err, requested, timeoutSignal, opts, deps);
  }

  return {
    text: decode(bytes, rawType, opts.expect),
    finalUrl: finalUrl.href,
    status: response.status,
    contentType: mime,
  };
}

async function isAllowed(url: URL, opts: FetchOptions, deps: NetworkDeps): Promise<boolean> {
  if (opts.corsOrigins?.includes(url.origin)) return true;
  return deps.permissions.contains(originPattern(url));
}

async function classifyThrown(
  err: unknown,
  requested: URL,
  timeoutSignal: AbortSignal,
  opts: FetchOptions,
  deps: NetworkDeps,
): Promise<ConnectorError> {
  if (timeoutSignal.aborted) return new ConnectorError('timeout', 'Délai de réponse dépassé.');
  if (opts.signal?.aborted) return new ConnectorError('aborted', 'Collecte annulée.');
  // A CORS/permission failure surfaces as a generic TypeError: disambiguate.
  if (!(await isAllowed(requested, opts, deps).catch(() => false))) {
    return new ConnectorError('permission', `Accès à ${requested.host} non autorisé.`);
  }
  return new ConnectorError('network', err instanceof Error ? `Erreur réseau (${err.name}).` : 'Erreur réseau.');
}

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(await response.arrayBuffer()).slice(0, maxBytes + 1);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ConnectorError('too-large', `Réponse trop volumineuse (> ${maxBytes} octets).`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Charset: HTTP header first, then the XML declaration, then UTF-8. */
export function decode(bytes: Uint8Array, contentType: string, expect: ExpectedKind): string {
  let label = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  if (!label && expect === 'xml') {
    const head = new TextDecoder('latin1').decode(bytes.slice(0, 200));
    label = /^\s*<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder(label ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export function parseRetryAfter(value: string | null, clock: Clock): string | undefined {
  if (!value) return undefined;
  const now = clock.now().getTime();
  if (/^\d+$/.test(value.trim())) {
    const seconds = Math.min(Number(value.trim()), 7 * 86_400);
    return toIsoUtc(new Date(now + seconds * 1000));
  }
  const t = Date.parse(value);
  if (Number.isNaN(t)) return undefined;
  return toIsoUtc(new Date(Math.min(Math.max(t, now), now + 7 * 86_400_000)));
}

/** Runs async tasks with a concurrency limit, preserving result order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

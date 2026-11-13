import { describe, expect, it } from 'vitest';
import { fetchResource, parseRetryAfter } from '../../src/connectors/network-client';
import { fixedClock } from '../../src/shared/clock';
import { ConnectorError } from '../../src/shared/failures';
import { fakeFetch, fixture, netDeps, respond, xml } from '../net-helpers';

const FEED = 'https://blog.example.org/feed.xml';
const ORIGIN = 'https://blog.example.org/*';

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'resolved';
  } catch (e) {
    expect(e).toBeInstanceOf(ConnectorError);
    return (e as ConnectorError).code;
  }
}

describe('fetchResource', () => {
  it('fetches without credentials or referrer and returns text', async () => {
    const f = fakeFetch({ [FEED]: () => xml('<rss/>') });
    const r = await fetchResource(FEED, { expect: 'xml' }, netDeps(f.impl, [ORIGIN]));
    expect(r.text).toBe('<rss/>');
    expect(f.calls[0]?.init).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
      cache: 'no-store',
    });
  });

  it('honours the charset declared in the XML prolog (Latin-1)', async () => {
    const f = fakeFetch({ [FEED]: () => xml(fixture('rss/rdf.xml'), { 'content-type': 'application/xml' }) });
    const r = await fetchResource(FEED, { expect: 'xml' }, netDeps(f.impl, [ORIGIN]));
    expect(r.text).toContain('Café crème');
  });

  it('refuses non-https URLs before any request', async () => {
    const f = fakeFetch({});
    expect(await codeOf(fetchResource('http://blog.example.org/feed', { expect: 'xml' }, netDeps(f.impl)))).toBe(
      'other',
    );
    expect(f.calls).toHaveLength(0);
  });

  it.each([
    [401, 'http'],
    [403, 'http'],
    [404, 'http'],
    [500, 'http'],
  ])('maps HTTP %i to %s with status code', async (status, code) => {
    const f = fakeFetch({ [FEED]: () => respond('nope', { status }) });
    try {
      await fetchResource(FEED, { expect: 'xml' }, netDeps(f.impl, [ORIGIN]));
      expect.unreachable();
    } catch (e) {
      expect((e as ConnectorError).code).toBe(code);
      expect((e as ConnectorError).statusCode).toBe(status);
    }
  });

  it('maps 429 to rate-limit and honours Retry-After seconds', async () => {
    const f = fakeFetch({ [FEED]: () => respond('', { status: 429, headers: { 'retry-after': '120' } }) });
    try {
      await fetchResource(FEED, { expect: 'xml' }, netDeps(f.impl, [ORIGIN]));
      expect.unreachable();
    } catch (e) {
      expect((e as ConnectorError).code).toBe('rate-limit');
      expect((e as ConnectorError).retryAfter).toBe('2026-11-12T12:02:00.000Z');
    }
  });

  it('rejects HTML pages served instead of a feed', async () => {
    const f = fakeFetch({
      [FEED]: () => respond('<html></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
    });
    expect(await codeOf(fetchResource(FEED, { expect: 'xml' }, netDeps(f.impl, [ORIGIN])))).toBe(
      'invalid-content-type',
    );
  });

  it('rejects oversized responses by declared length', async () => {
    const f = fakeFetch({ [FEED]: () => xml('<rss/>', { 'content-length': '999999999' }) });
    expect(await codeOf(fetchResource(FEED, { expect: 'xml' }, netDeps(f.impl, [ORIGIN])))).toBe('too-large');
  });

  it('stops reading a streamed body that exceeds the cap', async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(1024));
        if (pulled > 10_000) controller.close();
      },
    });
    const f = fakeFetch({
      [FEED]: () => respond(stream, { status: 200, headers: { 'content-type': 'application/xml' } }),
    });
    expect(await codeOf(fetchResource(FEED, { expect: 'xml', maxBytes: 4096 }, netDeps(f.impl, [ORIGIN])))).toBe(
      'too-large',
    );
    expect(pulled).toBeLessThan(20);
  });

  it('times out', async () => {
    const f = fakeFetch({
      [FEED]: (init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        ),
    });
    expect(await codeOf(fetchResource(FEED, { expect: 'xml', timeoutMs: 20 }, netDeps(f.impl, [ORIGIN])))).toBe(
      'timeout',
    );
  });

  it('reports user cancellation as aborted', async () => {
    const ac = new AbortController();
    const f = fakeFetch({
      [FEED]: (init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        ),
    });
    const p = fetchResource(FEED, { expect: 'xml', signal: ac.signal }, netDeps(f.impl, [ORIGIN]));
    ac.abort();
    expect(await codeOf(p)).toBe('aborted');
  });

  it('distinguishes missing permission from a network failure', async () => {
    const f = fakeFetch({}); // every call throws TypeError
    expect(await codeOf(fetchResource(FEED, { expect: 'xml' }, netDeps(f.impl)))).toBe('permission');
    expect(await codeOf(fetchResource(FEED, { expect: 'xml' }, netDeps(f.impl, [ORIGIN])))).toBe('network');
  });

  it('blocks redirects to an unauthorised origin or to http', async () => {
    const toOther = fakeFetch({
      [FEED]: () =>
        respond('<rss/>', {
          status: 200,
          url: 'https://cdn.example.net/feed.xml',
          headers: { 'content-type': 'application/xml' },
        }),
    });
    expect(await codeOf(fetchResource(FEED, { expect: 'xml' }, netDeps(toOther.impl, [ORIGIN])))).toBe(
      'redirect-blocked',
    );
    const allowed = await fetchResource(
      FEED,
      { expect: 'xml' },
      netDeps(toOther.impl, [ORIGIN, 'https://cdn.example.net/*']),
    );
    expect(allowed.finalUrl).toBe('https://cdn.example.net/feed.xml');

    const toHttp = fakeFetch({
      [FEED]: () =>
        respond('<rss/>', {
          status: 200,
          url: 'http://blog.example.org/feed.xml',
          headers: { 'content-type': 'application/xml' },
        }),
    });
    expect(await codeOf(fetchResource(FEED, { expect: 'xml' }, netDeps(toHttp.impl, [ORIGIN])))).toBe(
      'redirect-blocked',
    );
  });
});

describe('parseRetryAfter', () => {
  const clock = fixedClock('2026-11-12T12:00:00.000Z');
  it('parses HTTP dates and caps at 7 days', () => {
    expect(parseRetryAfter('Thu, 12 Nov 2026 13:00:00 GMT', clock)).toBe('2026-11-12T13:00:00.000Z');
    expect(parseRetryAfter('99999999', clock)).toBe('2026-11-19T12:00:00.000Z');
    expect(parseRetryAfter('garbage', clock)).toBeUndefined();
    expect(parseRetryAfter(null, clock)).toBeUndefined();
  });
});

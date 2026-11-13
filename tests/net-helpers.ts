import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FetchLike, NetworkDeps } from '../src/connectors/network-client';
import { fixedClock } from '../src/shared/clock';
import { memoryHostPermissions } from '../src/shared/permissions';

export const fixture = (rel: string) => readFileSync(resolve(__dirname, 'fixtures', rel));
export const fixtureText = (rel: string) => fixture(rel).toString('utf8');

export type Route = (init?: RequestInit) => Response | Promise<Response>;

export function respond(body: BodyInit | null, init: ResponseInit & { url?: string } = {}): Response {
  const { url, ...rest } = init;
  const res = new Response(body, rest);
  if (url) Object.defineProperty(res, 'url', { value: url });
  return res;
}

export function xml(body: string | Buffer, headers: Record<string, string> = {}): Response {
  return respond(typeof body === 'string' ? body : new Uint8Array(body), {
    status: 200,
    headers: { 'content-type': 'application/rss+xml', ...headers },
  });
}

export function json(value: unknown, status = 200): Response {
  return respond(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

/** Fake fetch routed by exact URL; unknown URLs fail like a network error. */
export function fakeFetch(routes: Record<string, Route>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const route = routes[url];
    if (!route) throw new TypeError('Failed to fetch');
    return route(init);
  };
  return { impl, calls };
}

export function netDeps(
  fetchImpl: FetchLike,
  granted: string[] = [],
  now = '2026-11-12T12:00:00.000Z',
): NetworkDeps & {
  permissions: ReturnType<typeof memoryHostPermissions>;
} {
  return { fetchImpl, permissions: memoryHostPermissions(granted), clock: fixedClock(now) };
}

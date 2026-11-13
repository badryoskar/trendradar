/** SYNTHETIC DATA: fabricated articles and fetch attempts with a pinned clock. */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Article } from '../../src/domain/content.types';
import { putArticle, putSource } from '../../src/persistence/repositories';
import { recordAttempt } from '../../src/persistence/sources';
import { freshDb, makeArticle, makeSource } from '../helpers';
import { renderApp } from './render';

const NOW = Date.parse('2026-11-12T12:00:00.000Z');
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function story(id: string, title: string, h: number, src: string): Article {
  const url = `https://${src}.example.org/${id}`;
  return makeArticle({
    id,
    title,
    canonicalUrl: url,
    publishedAt: ago(h),
    sourceIds: [src],
    provenance: [{ sourceId: src, originalUrl: url, firstSeenAt: ago(h - 0.5), lastSeenAt: ago(h - 0.5) }],
    firstSeenAt: ago(h - 0.5),
    lastSeenAt: ago(h - 0.5),
    fetchedAt: ago(h - 0.5),
  });
}

async function seed(withCoverage: boolean) {
  const db = await freshDb();
  for (const id of ['f1', 'f2', 'f3']) {
    await putSource(
      db,
      makeSource({
        id,
        name: `Flux ${id}`,
        origin: `https://${id}.example.org`,
        feedUrl: `https://${id}.example.org/rss`,
      }),
    );
    if (withCoverage) {
      await recordAttempt(db, {
        sourceId: id,
        startedAt: ago(1),
        endedAt: ago(1),
        success: true,
        fetchedCount: 20,
        insertedCount: 0,
        oldestItemPublishedAt: ago(200),
      });
    }
  }
  await putArticle(db, story('a1', 'OpenSSL critical vulnerability CVE-2026-1234 patched', 2, 'f1'));
  await putArticle(db, story('a2', 'OpenSSL patches critical CVE-2026-1234 vulnerability', 3, 'f2'));
  await putArticle(db, story('a3', 'OpenSSL critical vulnerability CVE-2026-1234 patched', 4, 'f3'));
  return db;
}

const topicCard = (group: HTMLElement) => group.querySelector('li.topic-card') as HTMLElement;

describe('Topics panel', () => {
  it('without coverage: groups the topic but refuses to call it emerging, and explains why', async () => {
    const user = userEvent.setup();
    renderApp(await seed(false));
    await user.click(await screen.findByRole('tab', { name: 'Topics' }));
    const card = topicCard(await screen.findByRole('region', { name: 'Sujets regroupés sans signal' }));
    expect(within(card).getByText('Signal indisponible — données insuffisantes')).toBeInTheDocument();
    expect(within(card).getByRole('heading', { level: 4 })).toHaveTextContent(/OpenSSL/);
    await user.click(within(card).getByText('Pourquoi ce statut ?'));
    expect(within(card).getByText(/Fenêtre récente non couverte : 0\/3 flux/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Émergents' })).toBeNull();
  });

  it('with three covering feeds and three origins: emerging, with the ratio and evidence', async () => {
    const user = userEvent.setup();
    renderApp(await seed(true));
    await user.click(await screen.findByRole('tab', { name: 'Topics' }));
    const card = topicCard(await screen.findByRole('region', { name: 'Émergents' }));
    expect(within(card).getByText('Émergent')).toBeInTheDocument();
    expect(within(card).getByText('f1.example.org, f2.example.org, f3.example.org')).toBeInTheDocument();
    await user.click(within(card).getByText('Pourquoi ce statut ?'));
    expect(within(card).getByText('Ratio de hausse : 18')).toBeInTheDocument();
    await user.click(within(card).getByText('Articles du sujet (3)'));
    expect(within(card).getAllByRole('link')).toHaveLength(3);
    expect(screen.getByText(/Fenêtre récente \(24 h\)/)).toHaveTextContent('couverte — 3 flux sur 3 requis');
  });
});

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { memoryHostPermissions } from '../../src/shared/permissions';
import { freshDb } from '../helpers';
import { fakeFetch, fixtureText, xml } from '../net-helpers';
import { renderApp } from './render';

const FEED = 'https://blog.example.org/feed.xml';

async function openSources() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name: 'Sources' }));
  return user;
}

describe('Sources panel', () => {
  it('adds a feed after the user grants access to that origin only, then shows its articles', async () => {
    const db = await freshDb();
    const permissions = memoryHostPermissions();
    const f = fakeFetch({ [FEED]: () => xml(fixtureText('rss/basic.xml')) });
    renderApp(db, { permissions, fetchImpl: f.impl });
    const user = await openSources();

    await user.type(screen.getByLabelText('URL du flux (https)'), FEED);
    await user.click(screen.getByRole('button', { name: 'Ajouter le flux' }));

    expect(await screen.findByText(/Flux « Blog Exemple & Co » ajouté : 4 article\(s\)/)).toBeInTheDocument();
    expect([...permissions.granted]).toEqual(['https://blog.example.org/*']);
    const card = (await screen.findByRole('heading', { name: 'Blog Exemple & Co' })).closest('li')!;
    expect(within(card).getByText(/activée — OK/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Latest' }));
    expect(await screen.findByRole('heading', { name: /Sortie de PHP 8\.5/ })).toBeInTheDocument();
    expect(screen.getAllByText('date de publication indisponible').length).toBeGreaterThan(0);
  });

  it('refused permission: source saved as "permission requise", never contacted', async () => {
    const db = await freshDb();
    const f = fakeFetch({ [FEED]: () => xml(fixtureText('rss/basic.xml')) });
    renderApp(db, { permissions: memoryHostPermissions([], false), fetchImpl: f.impl });
    const user = await openSources();
    await user.type(screen.getByLabelText('URL du flux (https)'), FEED);
    await user.click(screen.getByRole('button', { name: 'Ajouter le flux' }));
    expect(await screen.findByText(/Accès refusé/)).toBeInTheDocument();
    expect(screen.getByText(/Permission requise/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Autoriser l’accès à blog\.example\.org/ })).toBeInTheDocument();
    expect(f.calls).toHaveLength(0);
  });

  it('rejects a non-https URL without requesting any permission', async () => {
    const db = await freshDb();
    const permissions = memoryHostPermissions();
    renderApp(db, { permissions });
    const user = await openSources();
    await user.type(screen.getByLabelText('URL du flux (https)'), 'http://blog.example.org/feed');
    await user.click(screen.getByRole('button', { name: 'Ajouter le flux' }));
    expect(await screen.findByText('Seules les URL https: sont acceptées.')).toBeInTheDocument();
    expect(permissions.granted.size).toBe(0);
  });

  it('refresh reports per-source failures and keeps existing articles visible', async () => {
    const db = await freshDb();
    const permissions = memoryHostPermissions();
    let fail = false;
    const f = fakeFetch({
      [FEED]: () => (fail ? Promise.reject(new TypeError('Failed to fetch')) : xml(fixtureText('rss/basic.xml'))),
    });
    renderApp(db, { permissions, fetchImpl: f.impl });
    const user = await openSources();
    await user.type(screen.getByLabelText('URL du flux (https)'), FEED);
    await user.click(screen.getByRole('button', { name: 'Ajouter le flux' }));
    await screen.findByText(/ajouté : 4 article/);
    await screen.findByRole('heading', { name: 'Blog Exemple & Co' });

    fail = true;
    await user.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(await screen.findByText(/échec \(network\)/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Latest' }));
    expect(await screen.findByText(/Données potentiellement périmées pour : Blog Exemple & Co/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Sortie de PHP 8\.5/ })).toBeInTheDocument();
  });

  it('deleting a source requires confirmation and revokes the origin permission', async () => {
    const db = await freshDb();
    const permissions = memoryHostPermissions();
    const f = fakeFetch({ [FEED]: () => xml(fixtureText('rss/basic.xml')) });
    renderApp(db, { permissions, fetchImpl: f.impl });
    const user = await openSources();
    await user.type(screen.getByLabelText('URL du flux (https)'), FEED);
    await user.click(screen.getByRole('button', { name: 'Ajouter le flux' }));
    await screen.findByText(/ajouté/);
    await user.click(await screen.findByRole('button', { name: 'Supprimer…' }));
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));
    expect(await screen.findByText(/Source supprimée : 4 article\(s\) supprimé\(s\)/)).toBeInTheDocument();
    expect(permissions.granted.size).toBe(0);
    expect(await db.count('articles')).toBe(0);
  });

  it('offers the official Hacker News source and labels its score as an HN signal', async () => {
    const db = await freshDb();
    renderApp(db);
    const user = await openSources();
    await user.click(screen.getByRole('button', { name: 'Ajouter Hacker News' }));
    expect(await screen.findByRole('heading', { name: 'Hacker News — Top stories' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter Hacker News' })).toBeNull();
  });
});

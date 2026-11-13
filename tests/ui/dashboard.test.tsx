import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { putArticle, putSource } from '../../src/persistence/repositories';
import { freshDb, makeArticle, makeSource } from '../helpers';
import { memoryHostPermissions } from '../../src/shared/permissions';
import { renderApp } from './render';

describe('dashboard', () => {
  it('shows "configuration requise" and no fake content when there is no source', async () => {
    renderApp(await freshDb());
    expect(await screen.findByText('Configuration requise')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('tabs follow the WAI-ARIA keyboard pattern', async () => {
    const user = userEvent.setup();
    renderApp(await freshDb());
    await screen.findByText('Configuration requise');
    const latest = screen.getByRole('tab', { name: 'Latest' });
    latest.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Topics' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Topics' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Latest' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Topics shows "insufficient data" instead of invented trends', async () => {
    const user = userEvent.setup();
    renderApp(await freshDb());
    await user.click(await screen.findByRole('tab', { name: 'Topics' }));
    expect(screen.getByText('Aucun sujet regroupé')).toBeInTheDocument();
    expect(screen.getByText(/Fenêtre récente \(24 h\)/)).toHaveTextContent('non couverte — 0 flux sur 3 requis');
  });

  it('renders provenance, distinct dates and the unknown-date label', async () => {
    const db = await freshDb();
    await putSource(db, makeSource());
    await putArticle(db, makeArticle());
    const { publishedAt: _drop, ...undated } = makeArticle({
      id: 'art-2',
      canonicalUrl: 'https://a.example.org/2',
      title: 'Sans date',
    });
    await putArticle(db, { ...undated, temporalQuality: 'unknown' });
    renderApp(db);

    const card = (await screen.findByRole('heading', { name: /Sans date/ })).closest('li')!;
    expect(within(card).getByText('date de publication indisponible')).toBeInTheDocument();
    expect(within(card).getByText(/Source A — a\.example\.org/)).toBeInTheDocument();

    const dated = screen.getByRole('heading', { name: /Un article de test/ }).closest('li')!;
    expect(within(dated).getByText('Publié :')).toBeInTheDocument();
    expect(within(dated).getByText('Découvert :')).toBeInTheDocument();
    expect(within(dated).queryByText('date de publication indisponible')).toBeNull();
  });

  it('renders HTML in titles as inert text and refuses unsafe links', async () => {
    const db = await freshDb();
    await putSource(db, makeSource());
    await putArticle(db, makeArticle({ title: '<img src=x onerror=alert(1)> titre' }));
    const { container } = renderApp(db);
    expect(await screen.findByText(/<img src=x onerror=alert\(1\)> titre/)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    for (const a of container.querySelectorAll('a[href]')) {
      expect(a.getAttribute('href')).toMatch(/^(https?:|#)/);
    }
  });

  it('saving an article persists and shows it under Saved', async () => {
    const user = userEvent.setup();
    const db = await freshDb();
    await putSource(db, makeSource());
    await putArticle(db, makeArticle());
    renderApp(db);
    await user.click(await screen.findByRole('button', { name: 'Sauvegarder' }));
    expect(await screen.findByRole('button', { name: 'Retirer des favoris' })).toHaveAttribute('aria-pressed', 'true');
    expect((await db.get('userState', 'art-1'))?.isSaved).toBe(true);
    await user.click(screen.getByRole('tab', { name: 'Saved' }));
    expect(screen.getByRole('heading', { name: /Un article de test/ })).toBeInTheDocument();
  });

  it('loads the labelled demo dataset on explicit request only', async () => {
    const user = userEvent.setup();
    const db = await freshDb();
    renderApp(db);
    await user.click(await screen.findByRole('tab', { name: 'Settings' }));
    expect(await db.count('articles')).toBe(0);
    await user.click(await screen.findByRole('button', { name: 'Charger la démo' }));
    expect(await screen.findByText(/article\(s\) de démonstration chargé\(s\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Latest' }));
    const badges = await screen.findAllByText('Démo');
    expect(badges.length).toBe(await db.count('articles'));
  });

  it('delete-all requires an explicit confirmation', async () => {
    const user = userEvent.setup();
    const db = await freshDb();
    await putSource(db, makeSource());
    await putArticle(db, makeArticle());
    renderApp(db);
    await user.click(await screen.findByRole('tab', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer toutes les données…' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(await db.count('articles')).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Supprimer toutes les données…' }));
    await user.click(screen.getByRole('button', { name: 'Oui, tout supprimer' }));
    expect(await screen.findByText('Toutes les données locales ont été supprimées.')).toBeInTheDocument();
    expect(await db.count('articles')).toBe(0);
  });

  it('delete-all also revokes every granted site access', async () => {
    const user = userEvent.setup();
    const db = await freshDb();
    const permissions = memoryHostPermissions(['https://a.example.org/*', 'https://b.example.org/*']);
    renderApp(db, { permissions });
    await user.click(await screen.findByRole('tab', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer toutes les données…' }));
    await user.click(screen.getByRole('button', { name: 'Oui, tout supprimer' }));
    expect(await screen.findByText(/et 2 accès à des sites révoqué\(s\)/)).toBeInTheDocument();
    expect(permissions.granted.size).toBe(0);
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { putArticle, putSource } from '../../src/persistence/repositories';
import { freshDb, makeArticle, makeSource } from '../helpers';
import { renderApp } from './render';

async function seed() {
  const db = await freshDb();
  await putSource(db, makeSource({ name: 'Blog Alpha' }));
  await putArticle(
    db,
    makeArticle({ id: 'php', title: 'Sortie de PHP 8.5', canonicalUrl: 'https://a.example.org/php' }),
  );
  await putArticle(
    db,
    makeArticle({ id: 'sec', title: 'Nouvelle faille de sécurité', canonicalUrl: 'https://a.example.org/sec' }),
  );
  const { publishedAt: _d, ...noDate } = makeArticle({
    id: 'nd',
    title: 'Article sans date',
    canonicalUrl: 'https://a.example.org/nd',
  });
  await putArticle(db, { ...noDate, temporalQuality: 'unknown' });
  return db;
}

const headings = () => screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent ?? '');

describe('Latest: search, filters and sort', () => {
  it('searches accent-insensitively and shows the filtered count', async () => {
    const user = userEvent.setup();
    renderApp(await seed());
    await screen.findByText(/3 article\(s\)/);
    await user.type(screen.getByLabelText('Rechercher'), 'securite');
    expect(headings().some((h) => h.includes('sécurité'))).toBe(true);
    expect(headings().some((h) => h.includes('PHP'))).toBe(false);
    expect(screen.getByText(/1 article\(s\) sur 3/)).toBeInTheDocument();
  });

  it('filters by category computed from keywords', async () => {
    const user = userEvent.setup();
    renderApp(await seed());
    await screen.findByText(/3 article\(s\)/);
    await user.selectOptions(screen.getByLabelText('Catégorie'), 'Cybersecurity');
    expect(headings()).toEqual(['Nouvelle faille de sécurité (ouvre la publication d’origine dans un nouvel onglet)']);
  });

  it('lists undated articles only through the explicit "Date inconnue" filter', async () => {
    const user = userEvent.setup();
    renderApp(await seed());
    await screen.findByText(/3 article\(s\)/);
    await user.selectOptions(screen.getByLabelText('Publication (date déclarée)'), 'Publiés ces 7 derniers jours');
    expect(headings().some((h) => h.includes('sans date'))).toBe(false);
    await user.selectOptions(screen.getByLabelText('Publication (date déclarée)'), 'Date inconnue');
    expect(headings()).toHaveLength(1);
    expect(headings()[0]).toContain('Article sans date');
  });

  it('shows an informative empty state and can reset filters', async () => {
    const user = userEvent.setup();
    renderApp(await seed());
    await screen.findByText(/3 article\(s\)/);
    await user.type(screen.getByLabelText('Rechercher'), 'introuvable');
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Réinitialiser les filtres' })[0]!);
    expect(await screen.findByText(/3 article\(s\), triés/)).toBeInTheDocument();
  });
});

describe('categories', () => {
  it('explains automatic categories and lets the user correct them', async () => {
    const user = userEvent.setup();
    const db = await seed();
    renderApp(db);
    const card = (await screen.findByRole('heading', { name: /Sortie de PHP/ })).closest('li')!;
    expect(within(card).getByRole('list', { name: 'Catégories' })).toHaveTextContent('WordPress/PHP');
    await user.click(within(card).getByText('Pourquoi ces catégories ?'));
    expect(within(card).getByText(/WordPress\/PHP : mot\(s\)-clé\(s\) « php »/)).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Modifier les catégories' }));
    await user.click(within(card).getByLabelText('WordPress/PHP'));
    await user.click(within(card).getByLabelText('Design'));
    await user.click(within(card).getByRole('button', { name: 'Enregistrer la correction' }));

    const updated = (await screen.findByRole('list', { name: 'Catégories (correction manuelle)' })).closest(
      'li.card',
    ) as HTMLElement;
    expect(within(updated).getByRole('list', { name: 'Catégories (correction manuelle)' })).toHaveTextContent('Design');
    expect((await db.get('userState', 'php'))?.categoryOverride).toEqual(['design']);

    await user.click(within(updated).getByRole('button', { name: 'Modifier les catégories' }));
    await user.click(within(updated).getByRole('button', { name: 'Revenir au classement automatique' }));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Catégories (correction manuelle)' })).toBeNull());
    expect(screen.getAllByRole('list', { name: 'Catégories' })).toHaveLength(3);
    expect((await db.get('userState', 'php'))?.categoryOverride).toBeUndefined();
  });

  it('a new custom category immediately classifies matching articles', async () => {
    const user = userEvent.setup();
    renderApp(await seed());
    await user.click(await screen.findByRole('tab', { name: 'Settings' }));
    await user.type(screen.getByLabelText('Nom'), 'Failles');
    await user.type(screen.getByLabelText('Mots-clés (séparés par des virgules)'), 'faille, cve');
    await user.click(screen.getByRole('button', { name: 'Ajouter la catégorie' }));
    expect(await screen.findByText('Failles')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Latest' }));
    const card = (await screen.findByRole('heading', { name: /faille de sécurité/ })).closest('li')!;
    expect(within(card).getByRole('list', { name: 'Catégories' })).toHaveTextContent('Failles');
  });

  it('hidden categories disappear from cards and filters', async () => {
    const user = userEvent.setup();
    renderApp(await seed());
    await user.click(await screen.findByRole('tab', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Masquer Cybersecurity' }));
    await screen.findByRole('button', { name: 'Afficher Cybersecurity' });
    await user.click(screen.getByRole('tab', { name: 'Latest' }));
    await screen.findByText(/3 article\(s\)/);
    expect(within(screen.getByLabelText('Catégorie')).queryByText('Cybersecurity')).toBeNull();
    const card = screen.getByRole('heading', { name: /faille de sécurité/ }).closest('li')!;
    expect(within(card).getByRole('list', { name: 'Catégories' })).not.toHaveTextContent('Cybersecurity');
  });
});

import { useMemo, useState } from 'react';
import { DEFAULT_QUERY, runQuery, type ArticleQuery } from '../../domain/query';
import type { ArticleActions } from '../components/ArticleCard';
import { useServices } from '../services';
import type { DashboardData } from '../useDashboardData';
import { ArticleList } from './ArticleList';
import { RefreshBar, type RefreshController } from './RefreshBar';

interface Props extends ArticleActions {
  data: DashboardData;
  refresh: RefreshController;
  onOpenSources: () => void;
}

const SORT_LABEL: Record<ArticleQuery['sort'], string> = {
  'discovered-desc': 'date de découverte (plus récent d’abord)',
  'published-desc': 'date de publication (plus récent d’abord, dates inconnues en dernier)',
  'title-asc': 'titre (A → Z)',
};

export function LatestPanel({ data, refresh, onOpenSources, ...actions }: Props) {
  const { clock, timeZone } = useServices();
  const [q, setQ] = useState<ArticleQuery>(DEFAULT_QUERY);
  const sourcesById = useMemo(() => new Map(data.sources.map((s) => [s.id, s])), [data.sources]);
  const visibleCategories = data.categories.filter((c) => !c.hidden);

  const results = useMemo(
    () =>
      runQuery(data.articles, q, {
        now: clock.now(),
        timeZone,
        categories: data.categories,
        sourcesById,
        userStates: data.userStates,
      }).map((r) => r.article),
    [data.articles, data.categories, data.userStates, q, clock, timeZone, sourcesById],
  );

  const stale = data.sources.filter((s) => !s.isDemo && s.enabled && s.health !== 'ok' && s.health !== 'never-fetched');
  const filtered = JSON.stringify(q) !== JSON.stringify({ ...DEFAULT_QUERY, sort: q.sort });
  const set = <K extends keyof ArticleQuery>(k: K, v: ArticleQuery[K]) => setQ((prev) => ({ ...prev, [k]: v }));

  return (
    <>
      <h2>Derniers articles découverts</h2>
      {data.sources.some((s) => !s.isDemo) && <RefreshBar sources={data.sources} controller={refresh} />}
      {stale.length > 0 && (
        <div className="notice warning" role="status">
          Données potentiellement périmées pour : {stale.map((s) => s.name).join(', ')}. Les articles déjà collectés
          restent affichés.{' '}
          <button type="button" onClick={onOpenSources}>
            Voir les sources
          </button>
        </div>
      )}

      {data.articles.length > 0 && (
        <form className="filters" role="search" aria-label="Rechercher et filtrer" onSubmit={(e) => e.preventDefault()}>
          <div className="filter-field filter-search">
            <label htmlFor="q-text">Rechercher</label>
            <input
              id="q-text"
              type="search"
              placeholder="Titre, source, domaine ou catégorie"
              value={q.text}
              onChange={(e) => set('text', e.target.value)}
            />
          </div>
          <Select
            id="q-cat"
            label="Catégorie"
            value={q.categoryId}
            onChange={(v) => set('categoryId', v)}
            options={[['any', 'Toutes'], ...visibleCategories.map((c) => [c.id, c.label] as [string, string])]}
          />
          <Select
            id="q-src"
            label="Source"
            value={q.sourceId}
            onChange={(v) => set('sourceId', v)}
            options={[['any', 'Toutes'], ...data.sources.map((s) => [s.id, s.name] as [string, string])]}
          />
          <Select
            id="q-pub"
            label="Publication (date déclarée)"
            value={q.published}
            onChange={(v) => set('published', v as ArticleQuery['published'])}
            options={[
              ['any', 'Toutes'],
              ['today', 'Publiés aujourd’hui'],
              ['last7days', 'Publiés ces 7 derniers jours'],
              ['unknown', 'Date inconnue'],
            ]}
          />
          <Select
            id="q-disc"
            label="Découverte"
            value={q.discovered}
            onChange={(v) => set('discovered', v as ArticleQuery['discovered'])}
            options={[
              ['any', 'Toutes'],
              ['today', 'Découverts aujourd’hui'],
              ['last7days', 'Découverts ces 7 derniers jours'],
            ]}
          />
          <Select
            id="q-saved"
            label="Favoris"
            value={q.saved}
            onChange={(v) => set('saved', v as ArticleQuery['saved'])}
            options={[
              ['any', 'Tous'],
              ['yes', 'Favoris seulement'],
              ['no', 'Hors favoris'],
            ]}
          />
          <Select
            id="q-read"
            label="Lecture"
            value={q.read}
            onChange={(v) => set('read', v as ArticleQuery['read'])}
            options={[
              ['any', 'Tous'],
              ['no', 'Non lus'],
              ['yes', 'Lus'],
            ]}
          />
          <Select
            id="q-sort"
            label="Trier par"
            value={q.sort}
            onChange={(v) => set('sort', v as ArticleQuery['sort'])}
            options={[
              ['discovered-desc', 'Date de découverte'],
              ['published-desc', 'Date de publication'],
              ['title-asc', 'Titre'],
            ]}
          />
          {filtered && (
            <button type="button" onClick={() => setQ({ ...DEFAULT_QUERY, sort: q.sort })}>
              Réinitialiser les filtres
            </button>
          )}
        </form>
      )}

      <ArticleList
        articles={results}
        userStates={data.userStates}
        sourcesById={sourcesById}
        categories={data.categories}
        {...actions}
        summary={`${results.length} article(s)${filtered ? ` sur ${data.articles.length}` : ''}, triés par ${SORT_LABEL[q.sort]}.`}
        empty={
          data.articles.length > 0
            ? {
                title: 'Aucun résultat',
                body: 'Aucun article ne correspond à ces filtres. Les articles sans date déclarée n’apparaissent jamais dans les filtres de publication.',
                action: { label: 'Réinitialiser les filtres', onClick: () => setQ(DEFAULT_QUERY) },
              }
            : {
                title: data.sources.length === 0 ? 'Configuration requise' : 'Aucun article pour le moment',
                body:
                  data.sources.length === 0
                    ? 'Aucune source n’est configurée. Ajoutez une source, ou chargez le jeu de démonstration (données fictives) depuis Settings.'
                    : 'Les sources configurées n’ont encore rien collecté. Utilisez « Actualiser ».',
                action: { label: 'Ouvrir Sources', onClick: onOpenSources },
              }
        }
      />
    </>
  );
}

function Select({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="filter-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

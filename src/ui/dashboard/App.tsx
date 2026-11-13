import { useMemo, useState, type ReactNode } from 'react';
import type { Article } from '../../domain/content.types';
import { setRead, setSaved, putSettings } from '../../persistence/repositories';
import { useServices } from '../services';
import { useDashboardData, type DashboardData } from '../useDashboardData';
import { ArticleList } from './ArticleList';
import { SettingsPanel } from './SettingsPanel';
import { SourcesPanel } from './SourcesPanel';
import { Tabs, type TabDef } from './Tabs';
import { TopicsPanel } from './TopicsPanel';

export type TabId = 'latest' | 'topics' | 'saved' | 'sources' | 'settings';

const TABS: TabDef<TabId>[] = [
  { id: 'latest', label: 'Latest' },
  { id: 'topics', label: 'Topics' },
  { id: 'saved', label: 'Saved' },
  { id: 'sources', label: 'Sources' },
  { id: 'settings', label: 'Settings' },
];

function initialTab(): TabId {
  const hash = typeof location === 'undefined' ? '' : location.hash.slice(1);
  return TABS.some((t) => t.id === hash) ? (hash as TabId) : 'latest';
}

export function App() {
  const { state, reload } = useDashboardData();
  const [tab, setTab] = useState<TabId>(initialTab);

  function select(id: TabId) {
    setTab(id);
    try {
      history.replaceState(null, '', `#${id}`);
    } catch {
      /* non-critical */
    }
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Aller au contenu
      </a>
      <header className="app-header">
        <h1>TrendRadar</h1>
        <span className="excerpt-label">Traitement 100 % local</span>
      </header>
      <div className="layout">
        <Tabs tabs={TABS} selected={tab} onSelect={select} label="Sections du tableau de bord" />
        <main id="main">
          {state.status === 'loading' && <p role="status">Chargement des données locales…</p>}
          {state.status === 'error' && (
            <div className="notice warning" role="alert">
              <strong>Impossible de lire la base locale.</strong> {state.message}
            </div>
          )}
          {state.status === 'ready' && <Panels tab={tab} data={state.data} reload={reload} onNavigate={select} />}
        </main>
      </div>
    </>
  );
}

function Panels({
  tab,
  data,
  reload,
  onNavigate,
}: {
  tab: TabId;
  data: DashboardData;
  reload: () => Promise<void>;
  onNavigate: (id: TabId) => void;
}) {
  const { db, clock } = useServices();
  const [actionError, setActionError] = useState<string | null>(null);
  const sourcesById = useMemo(() => new Map(data.sources.map((s) => [s.id, s])), [data.sources]);
  const categoriesById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);

  async function run(action: () => Promise<unknown>) {
    try {
      setActionError(null);
      await action();
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  const listProps = {
    userStates: data.userStates,
    sourcesById,
    categoriesById,
    onToggleSaved: (a: Article, saved: boolean) => void run(() => setSaved(db, a.id, saved, clock)),
    onToggleRead: (a: Article, read: boolean) => void run(() => setRead(db, a.id, read, clock)),
  };

  const saved = data.articles.filter((a) => data.userStates.get(a.id)?.isSaved);
  const panel = (id: TabId, children: ReactNode) => (
    <section role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0} hidden={tab !== id}>
      {tab === id && children}
    </section>
  );

  return (
    <>
      {actionError && (
        <div className="notice warning" role="alert">
          Action non enregistrée : {actionError}
        </div>
      )}
      {data.invalidRecords > 0 && (
        <div className="notice warning" role="status">
          {data.invalidRecords} enregistrement(s) local(aux) invalide(s) ignoré(s).
        </div>
      )}
      {!data.settings.onboardingCompleted && (
        <div className="notice" role="region" aria-label="Bienvenue">
          <p>
            <strong>Bienvenue.</strong> TrendRadar fonctionne entièrement dans votre navigateur : aucune donnée de
            veille n’est envoyée à un serveur. Aucune collecte n’a lieu sans action de votre part.
          </p>
          <button
            type="button"
            onClick={() => void run(() => putSettings(db, { ...data.settings, onboardingCompleted: true }))}
          >
            J’ai compris
          </button>
        </div>
      )}
      {panel(
        'latest',
        <>
          <h2>Derniers articles découverts</h2>
          <ArticleList
            articles={data.articles}
            {...listProps}
            empty={{
              title: data.sources.length === 0 ? 'Configuration requise' : 'Aucun article pour le moment',
              body:
                data.sources.length === 0
                  ? 'Aucune source n’est configurée. Ajoutez une source, ou chargez le jeu de démonstration (données fictives) depuis Settings.'
                  : 'Les sources configurées n’ont encore rien collecté.',
              action: { label: 'Ouvrir Sources', onClick: () => onNavigate('sources') },
            }}
          />
        </>,
      )}
      {panel('topics', <TopicsPanel />)}
      {panel(
        'saved',
        <>
          <h2>Favoris</h2>
          <ArticleList
            articles={saved}
            {...listProps}
            empty={{ title: 'Aucun favori', body: 'Utilisez « Sauvegarder » sur un article pour le retrouver ici.' }}
          />
        </>,
      )}
      {panel('sources', <SourcesPanel sources={data.sources} />)}
      {panel('settings', <SettingsPanel settings={data.settings} run={run} />)}
    </>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import type { Article } from '../../domain/content.types';
import { putSettings, setCategoryOverride, setRead, setSaved } from '../../persistence/repositories';
import { isQuotaError, QUOTA_MESSAGE } from '../../shared/failures';
import { useServices } from '../services';
import { useDashboardData, type DashboardData } from '../useDashboardData';
import { ArticleList } from './ArticleList';
import { LatestPanel } from './LatestPanel';
import { useRefresh } from './RefreshBar';
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
  const refresh = useRefresh(reload);
  const sourcesById = useMemo(() => new Map(data.sources.map((s) => [s.id, s])), [data.sources]);

  async function run(action: () => Promise<unknown>) {
    try {
      setActionError(null);
      await action();
      await reload();
    } catch (err) {
      setActionError(isQuotaError(err) ? QUOTA_MESSAGE : err instanceof Error ? err.message : String(err));
    }
  }

  const actions = {
    onToggleSaved: (a: Article, saved: boolean) => void run(() => setSaved(db, a.id, saved, clock)),
    onToggleRead: (a: Article, read: boolean) => void run(() => setRead(db, a.id, read, clock)),
    onSetCategories: (a: Article, ids: string[] | undefined) => void run(() => setCategoryOverride(db, a.id, ids)),
  };

  const saved = data.articles
    .filter((a) => data.userStates.get(a.id)?.isSaved)
    .sort((x, y) => {
      const sx = data.userStates.get(x.id)?.savedAt ?? '';
      const sy = data.userStates.get(y.id)?.savedAt ?? '';
      return sx === sy ? x.id.localeCompare(y.id) : sx < sy ? 1 : -1;
    });
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
        <LatestPanel data={data} refresh={refresh} onOpenSources={() => onNavigate('sources')} {...actions} />,
      )}
      {panel('topics', <TopicsPanel data={data} />)}
      {panel(
        'saved',
        <>
          <h2>Favoris</h2>
          <ArticleList
            articles={saved}
            userStates={data.userStates}
            sourcesById={sourcesById}
            categories={data.categories}
            {...actions}
            summary={`${saved.length} favori(s), du plus récemment sauvegardé au plus ancien.`}
            empty={{ title: 'Aucun favori', body: 'Utilisez « Sauvegarder » sur un article pour le retrouver ici.' }}
          />
        </>,
      )}
      {panel('sources', <SourcesPanel sources={data.sources} run={run} refresh={refresh} />)}
      {panel('settings', <SettingsPanel settings={data.settings} categories={data.categories} run={run} />)}
    </>
  );
}

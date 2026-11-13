import { useMemo } from 'react';
import type { Article, TrendSignal } from '../../domain/content.types';
import { analyzeTopics, type TopicEntry } from '../../domain/topics';
import { MAX_GAP_HOURS, MIN_JACCARD, MIN_SHARED_SPECIFIC } from '../../domain/topic-cluster';
import {
  BASELINE_DAYS,
  MIN_COVERING_SOURCES,
  MIN_RATIO,
  MIN_RECENT_ARTICLES,
  MIN_RECENT_ORIGINS,
  MIN_RECURRING_DAYS,
  MIN_RECURRING_ORIGINS,
  RECENT_HOURS,
  RECURRING_LOOKBACK_DAYS,
} from '../../domain/trend-signal';
import { safeOutboundUrl } from '../../shared/safe-url';
import { EmptyState } from '../components/EmptyState';
import { formatDateTime } from '../format';
import { useServices } from '../services';
import type { DashboardData } from '../useDashboardData';

const STATUS_LABEL: Record<TrendSignal['status'], string> = {
  emerging: 'Émergent',
  recurring: 'Récurrent',
  'insufficient-data': 'Signal indisponible — données insuffisantes',
};

export function describeReason(code: string): string {
  const [key, value = ''] = code.split(':');
  switch (key) {
    case 'emerging':
      return 'Toutes les conditions du statut « émergent » sont remplies.';
    case 'recurring':
      return `Publié sur ${value.replace('days=', '')} jours distincts sur ${RECURRING_LOOKBACK_DAYS} jours, par au moins ${MIN_RECURRING_ORIGINS} origines.`;
    case 'recent-not-covered':
      return `Fenêtre récente non couverte : ${value} flux suffisamment récents (il en faut ${MIN_COVERING_SOURCES}).`;
    case 'baseline-not-covered':
      return `Fenêtre de référence non couverte : ${value} flux remontent assez loin (il en faut ${MIN_COVERING_SOURCES}).`;
    case 'too-few-recent-articles':
      return `Trop peu d’articles datés dans les dernières ${RECENT_HOURS} h (${value}).`;
    case 'too-few-recent-origins':
      return `Trop peu d’origines distinctes dans les dernières ${RECENT_HOURS} h (${value}).`;
    case 'ratio-below-threshold':
      return `Hausse insuffisante par rapport à la référence (ratio ${value.replace('<', ' < ')}).`;
    case 'undated-excluded':
      return `${value} article(s) sans date de publication exclu(s) des comptages.`;
    default:
      return code;
  }
}

export function TopicsPanel({ data }: { data: DashboardData }) {
  const { clock, locale, timeZone } = useServices();
  const analysis = useMemo(
    () => analyzeTopics(data.articles, data.attempts, data.sources, clock.now()),
    [data.articles, data.attempts, data.sources, clock],
  );
  const byId = useMemo(() => new Map(data.articles.map((a) => [a.id, a])), [data.articles]);
  const sourceName = new Map(data.sources.map((s) => [s.id, s.name]));
  const fmt = (iso: string) => formatDateTime(iso, locale, timeZone);
  const { coverage } = analysis;

  const groups: Array<[TrendSignal['status'], string, TopicEntry[]]> = [
    ['emerging', 'Émergents', analysis.topics.filter((t) => t.signal.status === 'emerging')],
    ['recurring', 'Récurrents', analysis.topics.filter((t) => t.signal.status === 'recurring')],
    [
      'insufficient-data',
      'Sujets regroupés sans signal',
      analysis.topics.filter((t) => t.signal.status === 'insufficient-data'),
    ],
  ];

  return (
    <>
      <h2>Sujets et signaux</h2>
      <div className="settings-group" role="region" aria-label="Couverture des données">
        <h3>Couverture des données</h3>
        <ul className="coverage">
          <li>
            Fenêtre récente ({RECENT_HOURS} h) : <strong>{coverage.recentCovered ? 'couverte' : 'non couverte'}</strong>{' '}
            — {coverage.recentSources.length} flux sur {MIN_COVERING_SOURCES} requis.
          </li>
          <li>
            Fenêtre de référence ({BASELINE_DAYS} jours précédents) :{' '}
            <strong>{coverage.baselineCovered ? 'couverte' : 'non couverte'}</strong> —{' '}
            {coverage.baselineSources.length} flux sur {MIN_COVERING_SOURCES} requis.
          </li>
        </ul>
        {!(coverage.recentCovered && coverage.baselineCovered) && (
          <p className="excerpt-label">
            Sans deux fenêtres couvertes, aucun sujet ne peut être déclaré « émergent ». Une fenêtre est couverte quand
            au moins {MIN_COVERING_SOURCES} flux RSS/Atom actualisés ont renvoyé des articles remontant jusqu’à son
            début. Hacker News (classement, pas une liste exhaustive) et la démo ne comptent pas.
          </p>
        )}
        <details className="why">
          <summary>
            Méthode (règles {analysis.clusteringRuleVersion} / signal v{analysis.trendRuleVersion})
          </summary>
          <ul>
            <li>
              Regroupement : titres normalisés, mots vides FR/EN retirés ; similarité de Jaccard ≥{' '}
              {String(MIN_JACCARD).replace('.', ',')} avec le premier article du sujet et au moins {MIN_SHARED_SPECIFIC}{' '}
              termes spécifiques communs ; écart maximal de {MAX_GAP_HOURS} h avec le dernier article du sujet. Le titre
              affiché est celui d’un article réel.
            </li>
            <li>
              Émergent : deux fenêtres couvertes, au moins {MIN_RECENT_ARTICLES} articles datés et {MIN_RECENT_ORIGINS}{' '}
              origines dans les {RECENT_HOURS} dernières heures, et un rythme au moins {MIN_RATIO}× supérieur à la
              référence (ratio = récents / ((référence + 1) / {BASELINE_DAYS})).
            </li>
            <li>
              Récurrent : articles publiés sur au moins {MIN_RECURRING_DAYS} jours distincts en{' '}
              {RECURRING_LOOKBACK_DAYS} jours, par au moins {MIN_RECURRING_ORIGINS} origines.
            </li>
            <li>
              Seules les dates de publication déclarées comptent. Le score Hacker News n’est jamais utilisé. Hacker News
              compte comme une seule origine.
            </li>
          </ul>
        </details>
        <p className="excerpt-label">{analysis.analysedArticles} article(s) des 14 derniers jours analysé(s).</p>
      </div>

      {analysis.topics.length === 0 ? (
        <EmptyState title="Aucun sujet regroupé">
          <p>
            Aucun groupe d’au moins deux articles proches n’a été trouvé. Les sujets apparaissent quand plusieurs
            publications traitent du même événement ; aucun résultat n’est simulé.
          </p>
        </EmptyState>
      ) : (
        groups
          .filter(([, , list]) => list.length > 0)
          .map(([status, title, list]) => (
            <section key={status} aria-label={title} className="topic-group">
              <h3>
                {title} ({list.length})
              </h3>
              <ul className="card-list">
                {list.map((t) => (
                  <TopicCard key={t.cluster.id} entry={t} byId={byId} sourceName={sourceName} fmt={fmt} />
                ))}
              </ul>
            </section>
          ))
      )}
    </>
  );
}

function TopicCard({
  entry: { cluster, signal },
  byId,
  sourceName,
  fmt,
}: {
  entry: TopicEntry;
  byId: Map<string, Article>;
  sourceName: Map<string, string>;
  fmt: (iso: string) => string;
}) {
  const members = cluster.articleIds.map((id) => byId.get(id)).filter((a): a is Article => a !== undefined);
  return (
    <li className="card topic-card">
      <p className={`status-badge status-${signal.status}`}>{STATUS_LABEL[signal.status]}</p>
      <h4>{cluster.label}</h4>
      <dl className="meta">
        <div>
          <dt>Articles :</dt>
          <dd>{cluster.articleIds.length}</dd>
        </div>
        <div>
          <dt>Sources :</dt>
          <dd>{cluster.distinctSourceIds.length}</dd>
        </div>
        <div>
          <dt>Origines :</dt>
          <dd>{cluster.distinctOrigins.join(', ')}</dd>
        </div>
        <div>
          <dt>Période observée :</dt>
          <dd>
            {fmt(cluster.firstObservedAt)} → {fmt(cluster.lastObservedAt)}
          </dd>
        </div>
        {cluster.sharedTerms.length > 0 && (
          <div>
            <dt>Termes communs :</dt>
            <dd>{cluster.sharedTerms.join(', ')}</dd>
          </div>
        )}
      </dl>
      <details className="why">
        <summary>Pourquoi ce statut ?</summary>
        <ul>
          <li>
            Fenêtre récente : {signal.recentWindow.count} article(s) daté(s) (
            {signal.recentWindow.covered ? 'couverte' : 'non couverte'}).
          </li>
          <li>
            Référence : {signal.baselineWindow.count} article(s) daté(s) (
            {signal.baselineWindow.covered ? 'couverte' : 'non couverte'}).
          </li>
          {signal.score !== undefined && <li>Ratio de hausse : {signal.score}</li>}
          {signal.reasonCodes.map((c) => (
            <li key={c}>{describeReason(c)}</li>
          ))}
        </ul>
      </details>
      <details className="why">
        <summary>Articles du sujet ({members.length})</summary>
        <ul>
          {members.map((a) => {
            const href = safeOutboundUrl(a.canonicalUrl);
            return (
              <li key={a.id}>
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {a.title}
                  </a>
                ) : (
                  a.title
                )}{' '}
                — {a.sourceIds.map((id) => sourceName.get(id) ?? id).join(', ')} —{' '}
                {a.publishedAt ? `publié ${fmt(a.publishedAt)}` : 'date de publication indisponible'}
              </li>
            );
          })}
        </ul>
      </details>
    </li>
  );
}

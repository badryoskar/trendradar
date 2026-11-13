import { useState, type FormEvent } from 'react';
import { addFeedSource, addHackerNews, type AddFeedOutcome } from '../../collection/add-source';
import { HN_SOURCE_ID } from '../../connectors/hacker-news';
import type { Source, SourceHealth } from '../../domain/content.types';
import { deleteSource, updateSource } from '../../persistence/sources';
import { recommendedAction } from '../../shared/failures';
import { checkFeedUrl, originPattern, safeOutboundUrl } from '../../shared/safe-url';
import { EmptyState } from '../components/EmptyState';
import { formatDateTime } from '../format';
import { useServices } from '../services';
import { RefreshBar, type RefreshController } from './RefreshBar';

const HEALTH_LABEL: Record<SourceHealth, string> = {
  'never-fetched': 'Jamais collectée',
  ok: 'OK',
  error: 'Erreur',
  'permission-needed': 'Permission requise',
  backoff: 'En pause (trop de requêtes ou erreur serveur)',
  interrupted: 'Collecte interrompue',
};

interface Props {
  sources: Source[];
  run: (action: () => Promise<unknown>) => Promise<void>;
  refresh: RefreshController;
}

export function SourcesPanel({ sources, run, refresh }: Props) {
  const { db, clock, fetchImpl, permissions, locale, timeZone } = useServices();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const deps = { fetchImpl, permissions, clock };
  const fmt = (iso: string | undefined) => (iso ? formatDateTime(iso, locale, timeZone) : 'jamais');

  function onAddFeed(e: FormEvent) {
    e.preventDefault();
    const check = checkFeedUrl(url);
    if (!check.ok) {
      setFeedback({ kind: 'error', text: check.reason });
      return;
    }
    // Requested synchronously inside the user gesture, for this origin only.
    const permission = permissions.request(originPattern(check.url)).catch(() => false);
    setBusy(true);
    setFeedback(null);
    void run(async () => {
      try {
        const outcome = await addFeedSource(db, { url, ...(name.trim() ? { name } : {}) }, await permission, deps);
        setFeedback(describeOutcome(outcome));
        if (outcome.status === 'added' || outcome.status === 'permission-needed') {
          setUrl('');
          setName('');
        }
      } finally {
        setBusy(false);
      }
    });
  }

  function grantAccess(source: Source) {
    const permission = permissions.request(originPattern(new URL(source.feedUrl ?? source.origin))).catch(() => false);
    void run(async () => {
      if (await permission) {
        await updateSource(db, source.id, (s) => {
          const { lastErrorCode: _c, lastErrorMessage: _m, ...rest } = s;
          return { ...rest, health: 'never-fetched' };
        });
        setFeedback({ kind: 'ok', text: `Accès accordé pour ${new URL(source.origin).host}. Lancez « Actualiser ».` });
      } else {
        setFeedback({ kind: 'error', text: 'Accès refusé : la source ne sera pas interrogée.' });
      }
    });
  }

  function remove(source: Source) {
    void run(async () => {
      const r = await deleteSource(db, source.id);
      const stillUsed = sources.some((s) => s.id !== source.id && s.kind === 'feed' && s.origin === source.origin);
      if (source.kind === 'feed' && !stillUsed) {
        await permissions.remove(originPattern(new URL(source.origin))).catch(() => false);
      }
      setConfirmDelete(null);
      setFeedback({
        kind: 'ok',
        text: `Source supprimée : ${r.deletedArticles} article(s) supprimé(s)${r.keptSaved ? `, ${r.keptSaved} favori(s) conservé(s)` : ''}.`,
      });
    });
  }

  const hasHn = sources.some((s) => s.id === HN_SOURCE_ID);

  return (
    <>
      <h2>Sources</h2>
      <RefreshBar sources={sources} controller={refresh} />
      {feedback && (
        <div
          className={`notice${feedback.kind === 'error' ? ' warning' : ''}`}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          {feedback.text}
        </div>
      )}

      <div className="settings-group">
        <h3>Ajouter un flux RSS/Atom</h3>
        <form onSubmit={onAddFeed}>
          <div className="field">
            <label htmlFor="feed-url">URL du flux (https)</label>
            <input
              id="feed-url"
              type="url"
              inputMode="url"
              required
              placeholder="https://example.com/feed.xml"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-describedby="feed-help"
            />
          </div>
          <div className="field">
            <label htmlFor="feed-name">Nom (facultatif)</label>
            <input id="feed-name" type="text" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <p id="feed-help" className="excerpt-label">
            Chrome vous demandera l’accès à ce seul site. Un test de collecte (50 éléments maximum) est effectué avant
            l’enregistrement. N’ajoutez que des flux dont l’usage est autorisé par l’éditeur.
          </p>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Test en cours…' : 'Ajouter le flux'}
          </button>
        </form>
      </div>

      {!hasHn && (
        <div className="settings-group">
          <h3>Hacker News (API officielle)</h3>
          <p className="excerpt-label">
            30 articles maximum par collecte depuis la liste « top stories ». Le score HN est affiché comme signal
            propre à HN, jamais comme popularité générale.
          </p>
          <button type="button" onClick={() => void run(() => addHackerNews(db, { clock }))}>
            Ajouter Hacker News
          </button>
        </div>
      )}

      {sources.length === 0 ? (
        <EmptyState title="Aucune source configurée">
          <p>Aucune collecte n’est possible tant qu’aucune source n’est ajoutée.</p>
        </EmptyState>
      ) : (
        <ul className="card-list">
          {sources.map((s) => {
            const attribution = safeOutboundUrl(s.attributionUrl);
            return (
              <li key={s.id} className="card">
                <h3>
                  {s.isDemo && <span className="badge-demo">Démo</span>}
                  {s.name}
                </h3>
                <dl className="meta">
                  <div>
                    <dt>Type :</dt>
                    <dd>{s.kind === 'hacker-news' ? 'API Hacker News' : `Flux ${s.detectedFormat ?? 'RSS/Atom'}`}</dd>
                  </div>
                  <div>
                    <dt>Origine :</dt>
                    <dd>
                      {attribution ? (
                        <a href={attribution} target="_blank" rel="noopener noreferrer">
                          {new URL(s.origin).host}
                        </a>
                      ) : (
                        s.origin
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>État :</dt>
                    <dd>
                      {s.enabled ? 'activée' : 'désactivée'} —{' '}
                      {s.isDemo ? 'données fictives, jamais collectée' : HEALTH_LABEL[s.health]}
                    </dd>
                  </div>
                  {!s.isDemo && (
                    <>
                      <div>
                        <dt>Dernier succès :</dt>
                        <dd>{fmt(s.lastSuccessAt)}</dd>
                      </div>
                      <div>
                        <dt>Dernière tentative :</dt>
                        <dd>{fmt(s.lastAttemptAt)}</dd>
                      </div>
                    </>
                  )}
                  {s.backoffUntil && (
                    <div>
                      <dt>En pause jusqu’à :</dt>
                      <dd>{fmt(s.backoffUntil)}</dd>
                    </div>
                  )}
                </dl>
                {s.lastErrorCode && s.health !== 'ok' && (
                  <p className="excerpt" role="note">
                    <strong>
                      Dernière erreur ({s.lastErrorCode}, {fmt(s.lastErrorAt)}) :
                    </strong>{' '}
                    {s.lastErrorMessage} {recommendedAction(s.lastErrorCode)}
                  </p>
                )}
                {!s.isDemo && (
                  <div className="card-actions">
                    {s.health === 'permission-needed' && (
                      <button type="button" className="primary" onClick={() => grantAccess(s)}>
                        Autoriser l’accès à {new URL(s.origin).host}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-pressed={s.enabled}
                      onClick={() => void run(() => updateSource(db, s.id, (x) => ({ ...x, enabled: !x.enabled })))}
                    >
                      {s.enabled ? 'Désactiver' : 'Activer'}
                    </button>
                    {confirmDelete === s.id ? (
                      <span
                        role="group"
                        aria-label={`Confirmer la suppression de ${s.name}`}
                        className="card-actions"
                        style={{ marginTop: 0 }}
                      >
                        <button type="button" className="danger" onClick={() => remove(s)}>
                          Confirmer la suppression
                        </button>
                        <button type="button" autoFocus onClick={() => setConfirmDelete(null)}>
                          Annuler
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="danger" onClick={() => setConfirmDelete(s.id)}>
                        Supprimer…
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function describeOutcome(o: AddFeedOutcome): { kind: 'ok' | 'error'; text: string } {
  switch (o.status) {
    case 'added':
      return { kind: 'ok', text: `Flux « ${o.source.name} » ajouté : ${o.inserted} article(s) collecté(s).` };
    case 'permission-needed':
      return {
        kind: 'error',
        text: 'Accès refusé : la source est enregistrée comme « permission requise » et ne sera pas interrogée.',
      };
    case 'duplicate':
      return { kind: 'error', text: `Ce flux est déjà configuré (« ${o.source.name} »).` };
    case 'invalid':
      return { kind: 'error', text: o.reason };
    case 'failed':
      return {
        kind: 'error',
        text: `Test de collecte échoué (${o.code}) : ${o.message} Le flux n’a pas été enregistré.`,
      };
  }
}

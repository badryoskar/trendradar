import type { Source, SourceHealth } from '../../domain/content.types';
import { EmptyState } from '../components/EmptyState';
import { formatDateTime } from '../format';
import { useServices } from '../services';

const HEALTH_LABEL: Record<SourceHealth, string> = {
  'never-fetched': 'Jamais collectée',
  ok: 'OK',
  error: 'Erreur',
  'permission-needed': 'Permission requise',
  backoff: 'En pause (trop de requêtes)',
  interrupted: 'Collecte interrompue',
};

export function SourcesPanel({ sources }: { sources: Source[] }) {
  const { locale, timeZone } = useServices();
  return (
    <>
      <h2>Sources</h2>
      <div className="notice" role="note">
        L’ajout de flux RSS/Atom et de Hacker News sera disponible dans la prochaine version. Chaque nouvelle origine
        demandera votre autorisation explicite.
      </div>
      {sources.length === 0 ? (
        <EmptyState title="Aucune source configurée">
          <p>Aucune collecte n’est possible tant qu’aucune source n’est ajoutée.</p>
        </EmptyState>
      ) : (
        <ul className="card-list">
          {sources.map((s) => (
            <li key={s.id} className="card">
              <h3>
                {s.isDemo && <span className="badge-demo">Démo</span>}
                {s.name}
              </h3>
              <dl className="meta">
                <div>
                  <dt>Origine :</dt>
                  <dd>{s.origin}</dd>
                </div>
                <div>
                  <dt>État :</dt>
                  <dd>
                    {s.enabled ? 'activée' : 'désactivée'} —{' '}
                    {s.isDemo ? 'données fictives, jamais collectée' : HEALTH_LABEL[s.health]}
                  </dd>
                </div>
                <div>
                  <dt>Dernier succès :</dt>
                  <dd>{s.lastSuccessAt ? formatDateTime(s.lastSuccessAt, locale, timeZone) : 'aucun'}</dd>
                </div>
                {s.lastErrorCode && (
                  <div>
                    <dt>Dernière erreur :</dt>
                    <dd>
                      {s.lastErrorCode}
                      {s.lastErrorMessage ? ` — ${s.lastErrorMessage}` : ''}
                    </dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

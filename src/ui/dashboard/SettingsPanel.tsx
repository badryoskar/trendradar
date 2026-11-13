import { useEffect, useState } from 'react';
import type { Settings } from '../../domain/content.types';
import { hasDemoData, loadDemoData, removeDemoData } from '../../persistence/demo';
import { clearReadingHistory, deleteAllData, purgeExpiredArticles, putSettings } from '../../persistence/repositories';
import { useServices } from '../services';

interface Props {
  settings: Settings;
  run: (action: () => Promise<unknown>) => Promise<void>;
}

export function SettingsPanel({ settings, run }: Props) {
  const { db, clock } = useServices();
  const [retention, setRetention] = useState(String(settings.retentionDays));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [demoLoaded, setDemoLoaded] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void hasDemoData(db).then(setDemoLoaded);
  }, [db, settings]);

  const retentionValue = Number(retention);
  const retentionValid = Number.isInteger(retentionValue) && retentionValue >= 1 && retentionValue <= 3650;

  return (
    <>
      <h2>Paramètres</h2>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}

      <div className="settings-group">
        <h3>Rétention</h3>
        <div className="field">
          <label htmlFor="retention">Conserver les articles (jours)</label>
          <input
            id="retention"
            type="number"
            min={1}
            max={3650}
            value={retention}
            aria-invalid={!retentionValid}
            aria-describedby="retention-help"
            onChange={(e) => setRetention(e.target.value)}
          />
          <button
            type="button"
            disabled={!retentionValid}
            onClick={() => void run(() => putSettings(db, { ...settings, retentionDays: retentionValue }))}
          >
            Enregistrer
          </button>
        </div>
        <p id="retention-help" className="excerpt-label">
          Entier entre 1 et 3650. Les favoris sont conservés lors de la purge.
        </p>
        <button
          type="button"
          onClick={() =>
            void run(async () => {
              const n = await purgeExpiredArticles(db, settings, clock);
              setMessage(`${n} article(s) expiré(s) supprimé(s).`);
            })
          }
        >
          Purger maintenant
        </button>
      </div>

      <div className="settings-group">
        <h3>Historique de lecture</h3>
        <p className="excerpt-label">
          Seules vos actions dans TrendRadar sont enregistrées. L’historique du navigateur n’est jamais lu.
        </p>
        <button
          type="button"
          onClick={() =>
            void run(async () => {
              const n = await clearReadingHistory(db);
              setMessage(`Historique effacé (${n} élément(s)).`);
            })
          }
        >
          Effacer l’historique de lecture
        </button>
      </div>

      <div className="settings-group">
        <h3>Jeu de démonstration</h3>
        <p className="excerpt-label">
          Articles fictifs, marqués « Démo », pointant vers example.com. Ils servent uniquement à visualiser
          l’interface.
        </p>
        {demoLoaded ? (
          <button
            type="button"
            onClick={() =>
              void run(async () => {
                const n = await removeDemoData(db);
                setMessage(`${n} article(s) de démonstration supprimé(s).`);
              })
            }
          >
            Retirer la démo
          </button>
        ) : (
          <button
            type="button"
            disabled={demoLoaded === null}
            onClick={() =>
              void run(async () => {
                const n = await loadDemoData(db, clock);
                setMessage(`${n} article(s) de démonstration chargé(s).`);
              })
            }
          >
            Charger la démo
          </button>
        )}
      </div>

      <div className="settings-group">
        <h3>Supprimer toutes les données</h3>
        <p className="excerpt-label">
          Sources, articles, favoris, historique et préférences locales. Action irréversible.
        </p>
        {!confirmDelete ? (
          <button type="button" className="danger" onClick={() => setConfirmDelete(true)}>
            Supprimer toutes les données…
          </button>
        ) : (
          <div className="confirm-box" role="group" aria-label="Confirmation de suppression">
            <p>Confirmer la suppression définitive de toutes les données locales ?</p>
            <div className="card-actions">
              <button
                type="button"
                className="danger"
                onClick={() =>
                  void run(async () => {
                    await deleteAllData(db);
                    setConfirmDelete(false);
                    setMessage('Toutes les données locales ont été supprimées.');
                  })
                }
              >
                Oui, tout supprimer
              </button>
              <button type="button" autoFocus onClick={() => setConfirmDelete(false)}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

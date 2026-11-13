import { useEffect, useState } from 'react';
import type { Category, Settings } from '../../domain/content.types';
import { CategoryManager } from './CategoryManager';
import { hasDemoData, loadDemoData, removeDemoData } from '../../persistence/demo';
import { clearReadingHistory, deleteAllData, purgeExpiredArticles, putSettings } from '../../persistence/repositories';
import { storageStatus, type StorageStatus } from '../../persistence/db';
import { revokeAllHostPermissions } from '../../shared/permissions';
import { useServices } from '../services';

interface Props {
  settings: Settings;
  categories: Category[];
  run: (action: () => Promise<unknown>) => Promise<void>;
}

export function SettingsPanel({ settings, categories, run }: Props) {
  const { db, clock, permissions } = useServices();
  const [retention, setRetention] = useState(String(settings.retentionDays));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [demoLoaded, setDemoLoaded] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [storage, setStorage] = useState<StorageStatus | null>(null);

  useEffect(() => {
    void hasDemoData(db).then(setDemoLoaded);
    void storageStatus().then(setStorage);
  }, [db, settings]);

  const mb = (n: number | null) => (n === null ? 'inconnu' : `${(n / 1024 / 1024).toFixed(1)} Mo`);

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

      <CategoryManager categories={categories} run={run} />

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
        <h3>Stockage local</h3>
        <p className="excerpt-label" role="status">
          Utilisé : {mb(storage?.usageBytes ?? null)} — quota disponible pour l’extension :{' '}
          {mb(storage?.quotaBytes ?? null)}. Protection contre l’effacement automatique :{' '}
          {storage?.persisted === true
            ? 'accordée'
            : storage?.persisted === false
              ? 'non accordée par le navigateur'
              : 'inconnue'}
          . Les données ne sont pas chiffrées par TrendRadar : elles sont protégées comme le reste de votre profil
          Chrome.
        </p>
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
                    const revoked = await revokeAllHostPermissions(permissions);
                    setConfirmDelete(false);
                    setMessage(
                      `Toutes les données locales ont été supprimées${revoked ? ` et ${revoked} accès à des sites révoqué(s)` : ''}.`,
                    );
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

import { useCallback, useRef, useState } from 'react';
import { refreshSources, type RefreshReport, type SourceRunState } from '../../collection/refresh';
import type { Source } from '../../domain/content.types';
import { recommendedAction } from '../../shared/failures';
import { formatDateTime } from '../format';
import { useServices } from '../services';

export interface RefreshController {
  running: boolean;
  progress: Record<string, SourceRunState>;
  lastReport: RefreshReport | null;
  start: (sources: Source[]) => Promise<void>;
  cancel: () => void;
}

export function useRefresh(reload: () => Promise<void>): RefreshController {
  const { db, clock, fetchImpl, permissions } = useServices();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Record<string, SourceRunState>>({});
  const [lastReport, setLastReport] = useState<RefreshReport | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (sources: Source[]) => {
      if (abortRef.current) return;
      const ac = new AbortController();
      abortRef.current = ac;
      setRunning(true);
      setProgress({});
      try {
        const report = await refreshSources(
          db,
          sources,
          { fetchImpl, permissions, clock },
          {
            signal: ac.signal,
            onProgress: (id, s) => setProgress((p) => ({ ...p, [id]: s })),
          },
        );
        setLastReport(report);
      } finally {
        abortRef.current = null;
        setRunning(false);
        await reload();
      }
    },
    [db, clock, fetchImpl, permissions, reload],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  return { running, progress, lastReport, start, cancel };
}

function describe(state: SourceRunState): string {
  switch (state.status) {
    case 'running':
      return 'collecte en cours…';
    case 'ok':
      return `${state.inserted} nouveau(x), ${state.updated} déjà connu(s)${state.warnings ? `, ${state.warnings} avertissement(s)` : ''}`;
    case 'error':
      return `échec (${state.code}) — ${state.message} ${recommendedAction(state.code)}`;
    case 'skipped':
      return state.reason === 'backoff'
        ? `ignorée : en pause${state.until ? ` jusqu’à ${state.until}` : ''}`
        : state.reason === 'disabled'
          ? 'ignorée : désactivée'
          : 'ignorée : démonstration';
  }
}

export function RefreshBar({ sources, controller }: { sources: Source[]; controller: RefreshController }) {
  const { locale, timeZone } = useServices();
  const collectable = sources.filter((s) => !s.isDemo && s.enabled);
  const lastSuccess = collectable
    .map((s) => s.lastSuccessAt)
    .filter((x): x is string => x !== undefined)
    .sort()
    .at(-1);
  const names = new Map(sources.map((s) => [s.id, s.name]));
  const entries = Object.entries(controller.progress);

  return (
    <div className="settings-group" aria-label="Actualisation">
      <div className="card-actions" style={{ marginTop: 0, alignItems: 'center' }}>
        <button
          type="button"
          className="primary"
          disabled={controller.running || collectable.length === 0}
          onClick={() => void controller.start(sources)}
        >
          {controller.running ? 'Actualisation…' : 'Actualiser'}
        </button>
        {controller.running && (
          <button type="button" onClick={controller.cancel}>
            Annuler
          </button>
        )}
        <span className="excerpt-label">
          {collectable.length === 0
            ? 'Aucune source active à collecter.'
            : `Dernière collecte réussie : ${lastSuccess ? formatDateTime(lastSuccess, locale, timeZone) : 'jamais'}`}
        </span>
      </div>
      {entries.length > 0 && (
        <ul className="refresh-log" aria-live="polite">
          {entries.map(([id, state]) => (
            <li key={id} data-status={state.status}>
              <strong>{names.get(id) ?? id}</strong> : {describe(state)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

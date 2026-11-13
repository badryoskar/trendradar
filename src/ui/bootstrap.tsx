import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { openTrendRadarDb, requestPersistentStorage } from '../persistence/db';
import { systemClock } from '../shared/clock';
import { ServicesProvider, type AppServices } from './services';
import './styles.css';

/** Opens the local database and mounts a page. Shows a readable error otherwise. */
export async function mountPage(render: () => ReactNode): Promise<void> {
  const el = document.getElementById('root');
  if (!el) throw new Error('#root not found');
  const root = createRoot(el);
  try {
    const db = await openTrendRadarDb({
      onBlocked: () => console.warn('[TrendRadar] database upgrade blocked by another open page'),
    });
    void requestPersistentStorage();
    const services: AppServices = {
      db,
      clock: systemClock,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: 'fr-CA',
    };
    root.render(
      <StrictMode>
        <ServicesProvider services={services}>{render()}</ServicesProvider>
      </StrictMode>,
    );
  } catch (err) {
    root.render(
      <div className="notice warning" role="alert" style={{ margin: 16 }}>
        <strong>La base de données locale n’a pas pu être ouverte.</strong>{' '}
        {err instanceof Error ? err.message : String(err)}
      </div>,
    );
  }
}

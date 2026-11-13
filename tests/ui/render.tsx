import { render } from '@testing-library/react';
import type { DB } from '../../src/persistence/db';
import { fixedClock } from '../../src/shared/clock';
import { memoryHostPermissions } from '../../src/shared/permissions';
import { App } from '../../src/ui/dashboard/App';
import { ServicesProvider, type AppServices } from '../../src/ui/services';

export function renderApp(db: DB, overrides: Partial<AppServices> = {}) {
  const services: AppServices = {
    db,
    clock: fixedClock('2026-11-12T12:00:00.000Z'),
    timeZone: 'America/Toronto',
    locale: 'fr-CA',
    fetchImpl: () => Promise.reject(new TypeError('network disabled in tests')),
    permissions: memoryHostPermissions(),
    ...overrides,
  };
  return render(
    <ServicesProvider services={services}>
      <App />
    </ServicesProvider>,
  );
}

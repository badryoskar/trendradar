import { createContext, useContext, type ReactNode } from 'react';
import type { FetchLike } from '../connectors/network-client';
import type { DB } from '../persistence/db';
import type { Clock } from '../shared/clock';
import type { HostPermissions } from '../shared/permissions';

/** Everything the UI needs from the outside world, injectable for tests. */
export interface AppServices {
  db: DB;
  clock: Clock;
  /** IANA zone used for display and local-day windows. */
  timeZone: string;
  locale: string;
  fetchImpl: FetchLike;
  permissions: HostPermissions;
}

const ServicesContext = createContext<AppServices | null>(null);

export function ServicesProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('useServices must be used inside <ServicesProvider>');
  return s;
}

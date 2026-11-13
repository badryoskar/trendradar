import { useCallback, useEffect, useState } from 'react';
import type { Article, ArticleUserState, Category, FetchAttempt, Settings, Source } from '../domain/content.types';
import {
  getSettings,
  listArticlesByDiscovery,
  listCategories,
  listSources,
  listUserStates,
} from '../persistence/repositories';
import { listAttemptsSince } from '../persistence/sources';
import { toIsoUtc } from '../shared/clock';
import { useServices } from './services';

/** Upper bound of articles loaded in memory for the dashboard. */
export const MAX_LOADED_ARTICLES = 2000;

export interface DashboardData {
  articles: Article[];
  userStates: Map<string, ArticleUserState>;
  sources: Source[];
  categories: Category[];
  settings: Settings;
  /** Fetch attempts of the last 15 days (coverage of trend windows). */
  attempts: FetchAttempt[];
  /** Records rejected by runtime validation (shown as a diagnostic). */
  invalidRecords: number;
}

export type LoadState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: DashboardData };

export function useDashboardData(): { state: LoadState; reload: () => Promise<void> } {
  const { db, clock } = useServices();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const reload = useCallback(async () => {
    try {
      const since = toIsoUtc(new Date(clock.now().getTime() - 15 * 86_400_000));
      const [articles, userStates, sources, categories, settings, attempts] = await Promise.all([
        listArticlesByDiscovery(db, MAX_LOADED_ARTICLES),
        listUserStates(db),
        listSources(db),
        listCategories(db),
        getSettings(db),
        listAttemptsSince(db, since),
      ]);
      setState({
        status: 'ready',
        data: {
          articles: articles.items,
          userStates,
          sources: sources.items,
          categories: categories.items,
          settings,
          attempts,
          invalidRecords: articles.invalidCount + sources.invalidCount + categories.invalidCount,
        },
      });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [db, clock]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload };
}

import { useCallback, useEffect, useState } from 'react';
import type { Article, ArticleUserState, Category, Settings, Source } from '../domain/content.types';
import {
  getSettings,
  listArticlesByDiscovery,
  listCategories,
  listSources,
  listUserStates,
} from '../persistence/repositories';
import { useServices } from './services';

export interface DashboardData {
  articles: Article[];
  userStates: Map<string, ArticleUserState>;
  sources: Source[];
  categories: Category[];
  settings: Settings;
  /** Records rejected by runtime validation (shown as a diagnostic). */
  invalidRecords: number;
}

export type LoadState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: DashboardData };

export function useDashboardData(): { state: LoadState; reload: () => Promise<void> } {
  const { db } = useServices();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const reload = useCallback(async () => {
    try {
      const [articles, userStates, sources, categories, settings] = await Promise.all([
        listArticlesByDiscovery(db, 500),
        listUserStates(db),
        listSources(db),
        listCategories(db),
        getSettings(db),
      ]);
      setState({
        status: 'ready',
        data: {
          articles: articles.items,
          userStates,
          sources: sources.items,
          categories: categories.items,
          settings,
          invalidRecords: articles.invalidCount + sources.invalidCount + categories.invalidCount,
        },
      });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [db]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload };
}

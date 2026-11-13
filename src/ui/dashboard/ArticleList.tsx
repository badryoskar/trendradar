import type { Article, ArticleUserState, Category, Source } from '../../domain/content.types';
import { ArticleCard } from '../components/ArticleCard';
import { EmptyState } from '../components/EmptyState';

interface Props {
  articles: Article[];
  userStates: Map<string, ArticleUserState>;
  sourcesById: Map<string, Source>;
  categoriesById: Map<string, Category>;
  onToggleSaved: (a: Article, saved: boolean) => void;
  onToggleRead: (a: Article, read: boolean) => void;
  empty: { title: string; body: string; action?: { label: string; onClick: () => void } };
}

export function ArticleList({ articles, userStates, empty, ...rest }: Props) {
  if (articles.length === 0) {
    return (
      <EmptyState title={empty.title}>
        <p>{empty.body}</p>
        {empty.action && (
          <button type="button" onClick={empty.action.onClick}>
            {empty.action.label}
          </button>
        )}
      </EmptyState>
    );
  }
  return (
    <>
      <p className="excerpt-label" role="status">
        {articles.length} article(s), triés par date de découverte (plus récent d’abord).
      </p>
      <ul className="card-list">
        {articles.map((a) => (
          <ArticleCard key={a.id} article={a} state={userStates.get(a.id)} {...rest} />
        ))}
      </ul>
    </>
  );
}

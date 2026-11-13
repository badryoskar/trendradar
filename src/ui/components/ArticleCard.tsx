import type { Article, ArticleUserState, Category, Source } from '../../domain/content.types';
import { articleDates } from '../../domain/freshness';
import { safeOutboundUrl } from '../../shared/safe-url';
import { formatDateTime, hostOf } from '../format';
import { useServices } from '../services';

interface Props {
  article: Article;
  state: ArticleUserState | undefined;
  sourcesById: Map<string, Source>;
  categoriesById: Map<string, Category>;
  onToggleSaved: (article: Article, saved: boolean) => void;
  onToggleRead: (article: Article, read: boolean) => void;
}

export function ArticleCard({ article, state, sourcesById, categoriesById, onToggleSaved, onToggleRead }: Props) {
  const { locale, timeZone } = useServices();
  const href = safeOutboundUrl(article.canonicalUrl);
  const dates = articleDates(article);
  const sources = article.sourceIds.map((id) => sourcesById.get(id));
  const isDemo = sources.some((s) => s?.isDemo === true);
  const sourceLabel = sources.map((s, i) => s?.name ?? `Source inconnue (${article.sourceIds[i]})`).join(', ');
  const categoryIds = state?.categoryOverride ?? article.autoCategories;
  const isSaved = state?.isSaved ?? false;
  const isRead = state?.isRead ?? false;
  const titleId = `title-${article.id}`;

  return (
    <li className={`card${isRead ? ' is-read' : ''}`} aria-labelledby={titleId}>
      <h3 id={titleId}>
        {isDemo && <span className="badge-demo">Démo</span>}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => !isRead && onToggleRead(article, true)}
          >
            {article.title}
            <span className="visually-hidden"> (ouvre la publication d’origine dans un nouvel onglet)</span>
          </a>
        ) : (
          <span>
            {article.title} <span className="excerpt-label">(lien d’origine invalide, non ouvert)</span>
          </span>
        )}
      </h3>
      <dl className="meta">
        <div>
          <dt>Source :</dt>
          <dd>
            {sourceLabel}
            {href && ` — ${hostOf(href)}`}
          </dd>
        </div>
        <div>
          <dt>{dates.sourceDate?.kind === 'updated' ? 'Mis à jour (source) :' : 'Publié :'}</dt>
          <dd>
            {dates.sourceDate
              ? formatDateTime(dates.sourceDate.iso, locale, timeZone)
              : 'date de publication indisponible'}
          </dd>
        </div>
        <div>
          <dt>Découvert :</dt>
          <dd>{formatDateTime(dates.discoveredAt, locale, timeZone)}</dd>
        </div>
        {isRead && (
          <div>
            <dt>État :</dt>
            <dd>lu</dd>
          </div>
        )}
      </dl>
      {categoryIds.length > 0 && (
        <ul className="chips" aria-label="Catégories">
          {categoryIds.map((id) => (
            <li key={id} className="chip">
              {categoriesById.get(id)?.label ?? id}
            </li>
          ))}
        </ul>
      )}
      {article.excerpt !== undefined && (
        <p className="excerpt">
          <span className="excerpt-label">
            {article.excerptOrigin === 'api' ? 'Extrait de l’API' : 'Extrait du flux'} :{' '}
          </span>
          {article.excerpt}
        </p>
      )}
      <div className="card-actions">
        <button type="button" aria-pressed={isSaved} onClick={() => onToggleSaved(article, !isSaved)}>
          {isSaved ? 'Retirer des favoris' : 'Sauvegarder'}
        </button>
        <button type="button" onClick={() => onToggleRead(article, !isRead)}>
          {isRead ? 'Marquer comme non lu' : 'Marquer comme lu'}
        </button>
      </div>
    </li>
  );
}

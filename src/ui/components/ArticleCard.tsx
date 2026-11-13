import { useState } from 'react';
import { classifyArticle } from '../../domain/classify';
import type { Article, ArticleUserState, Category, Source } from '../../domain/content.types';
import { UNCLASSIFIED_CATEGORY_ID } from '../../domain/default-categories';
import { articleDates } from '../../domain/freshness';
import { safeOutboundUrl } from '../../shared/safe-url';
import { formatDateTime, hostOf } from '../format';
import { useServices } from '../services';

export interface ArticleActions {
  onToggleSaved: (article: Article, saved: boolean) => void;
  onToggleRead: (article: Article, read: boolean) => void;
  /** `undefined` = back to automatic classification. */
  onSetCategories: (article: Article, categoryIds: string[] | undefined) => void;
}

interface Props extends ArticleActions {
  article: Article;
  state: ArticleUserState | undefined;
  sourcesById: Map<string, Source>;
  categories: Category[];
}

export function ArticleCard({
  article,
  state,
  sourcesById,
  categories,
  onToggleSaved,
  onToggleRead,
  onSetCategories,
}: Props) {
  const { locale, timeZone } = useServices();
  const [editing, setEditing] = useState(false);
  const href = safeOutboundUrl(article.canonicalUrl);
  const dates = articleDates(article);
  const sources = article.sourceIds.map((id) => sourcesById.get(id));
  const isDemo = sources.some((s) => s?.isDemo === true);
  const sourceLabel = sources.map((s, i) => s?.name ?? `Source inconnue (${article.sourceIds[i]})`).join(', ');
  const classification = classifyArticle(article, categories, state);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const shown = classification.categoryIds.filter((id) => !byId.get(id)?.hidden);
  const isSaved = state?.isSaved ?? false;
  const isRead = state?.isRead ?? false;
  const titleId = `title-${article.id}`;
  const why = Object.entries(classification.matches);

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
        {article.provenance.flatMap((p) =>
          (p.metrics ?? [])
            .filter((m) => m.metric === 'hn.score')
            .map((m) => (
              <div key={`${p.sourceId}-${m.metric}`}>
                <dt>Signal HN :</dt>
                <dd>
                  {m.value} points sur Hacker News (relevé {formatDateTime(m.capturedAt, locale, timeZone)})
                </dd>
              </div>
            )),
        )}
        {isRead && (
          <div>
            <dt>État :</dt>
            <dd>lu</dd>
          </div>
        )}
      </dl>
      <ul
        className="chips"
        aria-label={classification.origin === 'override' ? 'Catégories (correction manuelle)' : 'Catégories'}
      >
        {shown.map((id) => (
          <li key={id} className="chip">
            {byId.get(id)?.label ?? id}
          </li>
        ))}
        {classification.origin === 'override' && <li className="chip chip-note">correction manuelle</li>}
      </ul>
      {article.excerpt !== undefined && (
        <p className="excerpt">
          <span className="excerpt-label">
            {article.excerptOrigin === 'api' ? 'Extrait de l’API' : 'Extrait du flux'} :{' '}
          </span>
          {article.excerpt}
        </p>
      )}
      {classification.origin === 'rules' && (why.length > 0 || article.autoCategories.length > 0) && (
        <details className="why">
          <summary>Pourquoi ces catégories ?</summary>
          <ul>
            {why.map(([id, kws]) => (
              <li key={id}>
                {byId.get(id)?.label ?? id} : mot(s)-clé(s) {kws.map((k) => `« ${k} »`).join(', ')}
              </li>
            ))}
            {article.autoCategories
              .filter((id) => !(id in classification.matches) && byId.has(id))
              .map((id) => (
                <li key={`src-${id}`}>{byId.get(id)?.label} : catégorie attribuée à la source</li>
              ))}
          </ul>
        </details>
      )}
      <div className="card-actions">
        <button type="button" aria-pressed={isSaved} onClick={() => onToggleSaved(article, !isSaved)}>
          {isSaved ? 'Retirer des favoris' : 'Sauvegarder'}
        </button>
        <button type="button" onClick={() => onToggleRead(article, !isRead)}>
          {isRead ? 'Marquer comme non lu' : 'Marquer comme lu'}
        </button>
        <button type="button" aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
          Modifier les catégories
        </button>
      </div>
      {editing && (
        <CategoryEditor
          categories={categories.filter((c) => c.id !== UNCLASSIFIED_CATEGORY_ID && !c.hidden)}
          initial={classification.categoryIds.filter((id) => id !== UNCLASSIFIED_CATEGORY_ID)}
          hasOverride={classification.origin === 'override'}
          title={article.title}
          onSave={(ids) => {
            onSetCategories(article, ids);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </li>
  );
}

function CategoryEditor({
  categories,
  initial,
  hasOverride,
  title,
  onSave,
  onCancel,
}: {
  categories: Category[];
  initial: string[];
  hasOverride: boolean;
  title: string;
  onSave: (ids: string[] | undefined) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(new Set(initial));
  return (
    <fieldset className="category-editor">
      <legend>Catégories de « {title} »</legend>
      <div className="checkbox-grid">
        {categories.map((c) => (
          <label key={c.id}>
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(c.id);
                else next.delete(c.id);
                setSelected(next);
              }}
            />{' '}
            {c.label}
          </label>
        ))}
      </div>
      <div className="card-actions">
        <button type="button" className="primary" onClick={() => onSave([...selected])}>
          Enregistrer la correction
        </button>
        {hasOverride && (
          <button type="button" onClick={() => onSave(undefined)}>
            Revenir au classement automatique
          </button>
        )}
        <button type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </fieldset>
  );
}

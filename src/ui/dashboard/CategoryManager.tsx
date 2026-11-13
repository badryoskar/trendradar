import { useState, type FormEvent } from 'react';
import { parseKeywordList } from '../../domain/classify';
import type { Category } from '../../domain/content.types';
import { UNCLASSIFIED_CATEGORY_ID } from '../../domain/default-categories';
import { addCustomCategory, deleteCustomCategory, updateCategory } from '../../persistence/repositories';
import { useServices } from '../services';

interface Props {
  categories: Category[];
  run: (action: () => Promise<unknown>) => Promise<void>;
}

export function CategoryManager({ categories, run }: Props) {
  const { db } = useServices();
  const [label, setLabel] = useState('');
  const [keywords, setKeywords] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    void run(async () => {
      await addCustomCategory(db, { label, keywords: parseKeywordList(keywords) });
      setLabel('');
      setKeywords('');
    });
  }

  return (
    <div className="settings-group">
      <h3>Catégories</h3>
      <p className="excerpt-label">
        Classement déterministe : une catégorie s’applique si un de ses mots-clés apparaît (mot entier, sans tenir
        compte des accents ni de la casse) dans le titre ou l’extrait, sauf si un mot d’exclusion apparaît aussi. Les
        catégories attribuées à la source s’ajoutent. Une correction manuelle sur un article remplace ce calcul.
      </p>
      <ul className="category-rows">
        {categories.map((c) =>
          editing === c.id ? (
            <CategoryEditRow
              key={c.id}
              category={c}
              onCancel={() => setEditing(null)}
              onSave={(next) =>
                void run(async () => {
                  await updateCategory(db, c.id, () => next);
                  setEditing(null);
                })
              }
            />
          ) : (
            <li key={c.id} className="category-row">
              <div>
                <strong>{c.label}</strong>
                {c.hidden && <span className="excerpt-label"> (masquée)</span>}
                {c.isCustom && <span className="excerpt-label"> (personnalisée)</span>}
                <div className="excerpt-label">
                  {c.id === UNCLASSIFIED_CATEGORY_ID
                    ? 'Attribuée quand aucune autre catégorie ne s’applique.'
                    : c.keywords.length
                      ? `Mots-clés : ${c.keywords.join(', ')}`
                      : 'Aucun mot-clé (attribution par la source ou manuelle uniquement).'}
                  {c.excludeKeywords.length > 0 && ` — Exclusions : ${c.excludeKeywords.join(', ')}`}
                </div>
              </div>
              {c.id !== UNCLASSIFIED_CATEGORY_ID && (
                <div className="card-actions" style={{ marginTop: 0 }}>
                  <button type="button" onClick={() => setEditing(c.id)} aria-label={`Modifier ${c.label}`}>
                    Modifier
                  </button>
                  <button
                    type="button"
                    aria-pressed={c.hidden}
                    aria-label={`${c.hidden ? 'Afficher' : 'Masquer'} ${c.label}`}
                    onClick={() => void run(() => updateCategory(db, c.id, (x) => ({ ...x, hidden: !x.hidden })))}
                  >
                    {c.hidden ? 'Afficher' : 'Masquer'}
                  </button>
                  {c.isCustom && (
                    <button
                      type="button"
                      className="danger"
                      aria-label={`Supprimer ${c.label}`}
                      onClick={() => void run(() => deleteCustomCategory(db, c.id))}
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              )}
            </li>
          ),
        )}
      </ul>
      <form onSubmit={onAdd}>
        <h4>Nouvelle catégorie</h4>
        <div className="field">
          <label htmlFor="cat-label">Nom</label>
          <input
            id="cat-label"
            type="text"
            maxLength={80}
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="cat-keywords">Mots-clés (séparés par des virgules)</label>
          <input id="cat-keywords" type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </div>
        <button type="submit">Ajouter la catégorie</button>
      </form>
    </div>
  );
}

function CategoryEditRow({
  category,
  onSave,
  onCancel,
}: {
  category: Category;
  onSave: (c: Category) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(category.label);
  const [keywords, setKeywords] = useState(category.keywords.join(', '));
  const [exclude, setExclude] = useState(category.excludeKeywords.join(', '));
  const prefix = `edit-${category.id}`;
  return (
    <li className="category-row editing">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          onSave({
            ...category,
            label: label.trim(),
            keywords: parseKeywordList(keywords),
            excludeKeywords: parseKeywordList(exclude),
          });
        }}
      >
        <div className="field">
          <label htmlFor={`${prefix}-label`}>Nom</label>
          <input
            id={`${prefix}-label`}
            type="text"
            maxLength={80}
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-kw`}>Mots-clés</label>
          <input id={`${prefix}-kw`} type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-ex`}>Exclusions</label>
          <input id={`${prefix}-ex`} type="text" value={exclude} onChange={(e) => setExclude(e.target.value)} />
        </div>
        <div className="card-actions">
          <button type="submit" className="primary">
            Enregistrer
          </button>
          <button type="button" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </form>
    </li>
  );
}

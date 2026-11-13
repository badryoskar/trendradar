import { useEffect, useState } from 'react';
import { countArticles, listSources } from '../../persistence/repositories';
import { useServices } from '../services';

export function Popup({ openDashboard }: { openDashboard: () => void }) {
  const { db } = useServices();
  const [summary, setSummary] = useState<{ articles: number; sources: number } | null>(null);

  useEffect(() => {
    void Promise.all([countArticles(db), listSources(db)]).then(([articles, sources]) =>
      setSummary({ articles, sources: sources.items.filter((s) => !s.isDemo).length }),
    );
  }, [db]);

  return (
    <div className="popup-body">
      <h1 style={{ fontSize: '1.05rem', margin: 0 }}>TrendRadar</h1>
      <p role="status">
        {summary === null
          ? 'Lecture des données locales…'
          : summary.sources === 0
            ? 'Configuration requise : aucune source ajoutée.'
            : `${summary.articles} article(s) stocké(s) localement, ${summary.sources} source(s).`}
      </p>
      <button type="button" className="primary" onClick={openDashboard}>
        Ouvrir le tableau de bord
      </button>
    </div>
  );
}

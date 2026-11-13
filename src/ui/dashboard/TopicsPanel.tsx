import { EmptyState } from '../components/EmptyState';

export function TopicsPanel() {
  return (
    <>
      <h2>Sujets et signaux</h2>
      <EmptyState title="Signal indisponible — historique insuffisant">
        <p>
          Un sujet n’est signalé comme <strong>récurrent</strong> ou <strong>émergent</strong> que si deux fenêtres
          temporelles sont couvertes par plusieurs sources indépendantes. Le regroupement de sujets n’est pas encore
          activé dans cette version : aucun signal n’est calculé, et aucun n’est simulé.
        </p>
      </EmptyState>
    </>
  );
}

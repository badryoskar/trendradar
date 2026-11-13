import type { FetchErrorCode } from '../domain/content.types';

/**
 * Typed collection failure. Messages are short, user-displayable and never
 * contain response bodies or personal content.
 */
export class ConnectorError extends Error {
  readonly code: FetchErrorCode;
  readonly statusCode: number | undefined;
  /** ISO UTC instant before which the source should not be retried. */
  readonly retryAfter: string | undefined;

  constructor(code: FetchErrorCode, message: string, opts: { statusCode?: number; retryAfter?: string } = {}) {
    super(message);
    this.name = 'ConnectorError';
    this.code = code;
    this.statusCode = opts.statusCode;
    this.retryAfter = opts.retryAfter;
  }
}

export const QUOTA_MESSAGE =
  'Espace de stockage local plein : réduisez la durée de rétention ou purgez les articles (Settings), puis réessayez.';

/** IndexedDB quota errors surface directly or as the error of an aborted transaction. */
export function isQuotaError(err: unknown): boolean {
  const e = err as { name?: string; error?: { name?: string }; target?: { error?: { name?: string } } } | null;
  return (
    e?.name === 'QuotaExceededError' ||
    e?.error?.name === 'QuotaExceededError' ||
    e?.target?.error?.name === 'QuotaExceededError'
  );
}

export function toConnectorError(err: unknown): ConnectorError {
  if (err instanceof ConnectorError) return err;
  if (isQuotaError(err)) return new ConnectorError('other', QUOTA_MESSAGE);
  if (err instanceof DOMException && err.name === 'AbortError')
    return new ConnectorError('aborted', 'Collecte annulée.');
  return new ConnectorError('other', err instanceof Error ? err.message.slice(0, 300) : 'Erreur inconnue.');
}

/** Human advice shown next to a failing source. */
export function recommendedAction(code: FetchErrorCode): string {
  switch (code) {
    case 'permission':
      return 'Accordez l’accès à ce site depuis la liste des sources.';
    case 'redirect-blocked':
      return 'Le flux redirige vers un autre site : ajoutez directement l’URL finale.';
    case 'timeout':
    case 'network':
      return 'Vérifiez votre connexion puis réessayez.';
    case 'rate-limit':
      return 'Le site limite les requêtes : TrendRadar attendra avant de réessayer.';
    case 'parse':
    case 'invalid-content-type':
      return 'L’URL ne semble pas être un flux RSS/Atom valide.';
    case 'too-large':
      return 'Le flux dépasse la taille maximale acceptée.';
    case 'http':
      return 'Le serveur a refusé la requête ; vérifiez l’URL.';
    case 'aborted':
      return 'Relancez l’actualisation.';
    case 'other':
      return 'Réessayez plus tard.';
  }
}
